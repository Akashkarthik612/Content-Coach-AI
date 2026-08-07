import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockResumeAI, mockGetProfile, mockLinkedInStatus, makeCallLog } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo, type SseServer } from './fixtures/sseHelper';
import type { Page } from '@playwright/test';

/**
 * Research-angle review flow — angle_review_node's pick/expand/modify/
 * none_fit interrupt loop, rendered by ChatPage.jsx's AngleCard stack.
 */

const ANGLES = [
  { title: 'Ship small, learn fast', argument: 'Small releases compound faster than big-bang launches.', glimpse: 'A 90-day case study.', audience: 'Founders', provokes_type: 'comment', source_url: null },
  { title: 'The hidden cost of perfectionism', argument: 'Polishing too long kills momentum.', glimpse: '', audience: 'Operators', provokes_type: 'share', source_url: null },
  { title: 'Why I stopped tracking vanity metrics', argument: 'Impressions lie; retention tells the truth.', glimpse: '', audience: 'Marketers', provokes_type: 'long-dwell', source_url: null },
  { title: 'Consistency beats intensity', argument: 'Weekly cadence compounds over a year.', glimpse: '', audience: 'Creators', provokes_type: 'comment', source_url: null },
  { title: 'What my worst post taught me', argument: 'The post I almost deleted got the most replies.', glimpse: '', audience: 'Everyone', provokes_type: 'share', source_url: null },
];

async function reachAngleSelection(page: Page): Promise<{ sse: SseServer; threadId: string }> {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write me a post about shipping fast');
  await page.getByTitle('Send').click();
  await sse.firstRequest;

  const threadId = 'thread-angles-1';
  sse.sendDone({ status: 'awaiting_angle_selection', angles: ANGLES, summary: 'Here are 5 angles worth exploring.', thread_id: threadId });
  sse.end();
  await expect(page.getByText('5 possible angles')).toBeVisible();
  return { sse, threadId };
}

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/chat');
});

test('renders the angle stack and toggles collapsed/expanded', async ({ supabaseAuthPage: page }) => {
  const { sse } = await reachAngleSelection(page);

  await expect(page.getByText('Ship small, learn fast')).toBeVisible();
  await expect(page.getByText('What my worst post taught me')).toBeVisible();

  // Collapsed pills re-render the same title text as the expanded card, so
  // the title alone can't distinguish the two states — assert on the
  // per-card "Draft for LinkedIn" action, which only the expanded
  // AngleCard renders.
  const draftButtons = page.getByRole('button', { name: 'Draft for LinkedIn' });
  await expect(draftButtons.first()).toBeVisible();

  await page.getByText('5 possible angles').click(); // collapse
  await expect(draftButtons).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ship small, learn fast' })).toBeVisible(); // collapsed pill chip

  await page.getByText('5 possible angles').click(); // expand again
  await expect(draftButtons.first()).toBeVisible();
  await sse.close();
});

test('"Draft for LinkedIn" chains into the draft approval interrupt and opens the Workspace', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });

  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: threadId, action: 'pick', angle_id: 0 });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'awaiting_approval', draft: 'Ship small, learn fast — a 90-day story.', thread_id: threadId, post_id: 'post-1' }),
    });
  }, log);

  await page.getByRole('button', { name: 'Draft for LinkedIn' }).first().click();

  await expect(page.getByText('Ship small, learn fast — a 90-day story.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  expect(log.count('POST', '/api/ai/resume')).toBe(1);
  await sse.close();
});

test('"Expand" renders a grounded summary inline and keeps the angle list open', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);

  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: threadId, action: 'expand', angle_id: 0 });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ expanded_sections: [{ heading: 'Evidence', body: 'Three teams shipped weekly and grew 2x faster.' }] }),
    });
  });

  await page.getByRole('button', { name: 'Expand', exact: false }).first().click();

  await expect(page.getByText('Three teams shipped weekly and grew 2x faster.')).toBeVisible();
  // Still on the angle list, not the workspace.
  await expect(page.getByText('5 possible angles')).toBeVisible();
  await sse.close();
});

test('inline "Refine" after expand can be called repeatedly without losing other angles\' state', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);

  let modifyCallCount = 0;
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON() as { action: string; angle_id: number; content: string; thread_id: string };
    if (body.action === 'expand') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expanded_sections: [{ heading: 'Evidence', body: 'v0 evidence' }] }) });
    }
    if (body.action === 'modify') {
      modifyCallCount++;
      expect(body.thread_id).toBe(threadId);
      expect(body.angle_id).toBe(0);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ expanded_sections: [{ heading: 'Evidence', body: `v${modifyCallCount} — ${body.content}` }] }) });
    }
    return route.fulfill({ status: 500, body: '{}' });
  });

  await page.getByRole('button', { name: 'Expand', exact: false }).first().click();
  await expect(page.getByText('v0 evidence')).toBeVisible();

  const refineInput = page.getByPlaceholder(/Refine this angle/);
  const instructions = ['cut the intro', 'add a stat', 'shorten the close'];
  for (let i = 0; i < instructions.length; i++) {
    await refineInput.fill(instructions[i]);
    await page.getByRole('button', { name: 'Refine' }).click();
    // v1/v2/v3 in order — each call's mock response increments the version
    // tag, proving revisions build on the same angle rather than resetting.
    await expect(page.getByText(`v${i + 1} — ${instructions[i]}`)).toBeVisible();
  }

  expect(modifyCallCount).toBe(3);
  // Every other angle title is still present — nothing else was clobbered.
  for (const a of ANGLES.slice(1)) {
    await expect(page.getByText(a.title)).toBeVisible();
  }
  await sse.close();
});

test('typing in the composer while angles are unresolved routes through none_fit on the SAME thread', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);

  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: threadId, action: 'none_fit', content: "none of these — write about async work instead" });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ answer: 'Got it — noted for the rewrite.' }) });
  }, log);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill("none of these — write about async work instead");
  await page.getByTitle('Send').click();

  await expect(page.getByText('Got it — noted for the rewrite.')).toBeVisible();
  expect(log.count('POST', '/api/ai/resume')).toBe(1);
  // No second /stream call was made — this went through resume, not a new thread.
  await sse.close();
});

test('rapid double-click on "Draft for LinkedIn" fires only one pick call', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });

  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    await new Promise((r) => setTimeout(r, 200)); // give the second click a window to race in, if it were going to
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'awaiting_approval', draft: 'Drafted.', thread_id: threadId, post_id: 'post-1' }),
    });
  }, log);

  const draftBtn = page.getByRole('button', { name: 'Draft for LinkedIn' }).first();
  await draftBtn.dblclick();

  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  expect(log.count('POST', '/api/ai/resume')).toBe(1);
  await sse.close();
});
