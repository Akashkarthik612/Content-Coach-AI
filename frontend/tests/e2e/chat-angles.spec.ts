import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockResumeAI, mockGetProfile, mockLinkedInStatus, makeCallLog } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo, type SseServer } from './fixtures/sseHelper';
import type { Page } from '@playwright/test';

/**
 * Research-angle review flow — angle_review_node's pick/none_fit interrupt
 * loop, rendered by ChatPage.jsx's multi-angle list. The "Honne Chat v3"
 * design canvas renders every returned angle (up to 5) as its own block —
 * lens label, title, claim, expandable body, audience, source — each with
 * its own independent "Draft for LinkedIn" button, not a single
 * recommendation card.
 */

const ANGLES = [
  { title: 'Ship small, learn fast', argument: 'Small releases compound faster than big-bang launches.', glimpse: 'A 90-day case study.', audience: 'Founders', provokes_type: 'comment', source_url: null, lens: 'The mechanism nobody names' },
  { title: 'The hidden cost of perfectionism', argument: 'Polishing too long kills momentum.', glimpse: 'A launch that never shipped.', audience: 'Operators', provokes_type: 'share', source_url: null, lens: 'The assumption everyone gets wrong' },
  { title: 'Why I stopped tracking vanity metrics', argument: 'Impressions lie; retention tells the truth.', glimpse: 'Three months of dashboards.', audience: 'Marketers', provokes_type: 'long-dwell', source_url: null, lens: 'The pattern borrowed from another domain' },
  { title: 'Consistency beats intensity', argument: 'Weekly cadence compounds over a year.', glimpse: 'A year of Tuesdays.', audience: 'Creators', provokes_type: 'comment', source_url: null, lens: 'The gap only a practitioner can fill' },
  { title: 'What my worst post taught me', argument: 'The post I almost deleted got the most replies.', glimpse: 'The delete button I never pressed.', audience: 'Everyone', provokes_type: 'share', source_url: null, lens: 'The second-order consequence' },
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
  await expect(page.getByText('Ship small, learn fast')).toBeVisible();
  return { sse, threadId };
}

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/chat');
});

test('renders all 5 angles, each with its own lens label and "Draft for LinkedIn" button', async ({ supabaseAuthPage: page }) => {
  const { sse } = await reachAngleSelection(page);

  await expect(page.getByText('Here are 5 angles worth exploring.')).toBeVisible();

  for (const a of ANGLES) {
    await expect(page.getByText(a.title)).toBeVisible();
    await expect(page.getByText(a.argument)).toBeVisible();
    await expect(page.getByText(a.lens)).toBeVisible();
  }

  await expect(page.getByRole('button', { name: 'Draft for LinkedIn' })).toHaveCount(ANGLES.length);
  await sse.close();
});

test('clicking the 3rd angle\'s "Draft for LinkedIn" opens the personalize modal for that angle, and "Skip" chains into pick with the right angle_id and opens the Workspace', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
  const pickedIndex = 2;

  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: threadId, action: 'pick', angle_id: pickedIndex, content: '' });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'awaiting_approval', draft: 'Why I stopped tracking vanity metrics — a retention story.', thread_id: threadId, post_id: 'post-1' }),
    });
  }, log);

  await page.getByRole('button', { name: 'Draft for LinkedIn' }).nth(pickedIndex).click();
  await expect(page.getByText('Personalize the hook?')).toBeVisible();
  await expect(page.getByText(`open “${ANGLES[pickedIndex].title}” with`)).toBeVisible();

  await page.getByRole('button', { name: 'Skip, write it your way' }).click();

  // pickAngle() opens the Workspace immediately on awaiting_approval — the
  // draft shows up in the editable textarea there, and "Save" is the real
  // approval action (there is no "Approve" button anywhere in this UI).
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('Why I stopped tracking vanity metrics — a retention story.');
  expect(log.count('POST', '/api/ai/resume')).toBe(1);
  await sse.close();
});

test('typing a stat into the personalize modal sends it as the "pick" hook input for the clicked angle', async ({ supabaseAuthPage: page }) => {
  const { sse, threadId } = await reachAngleSelection(page);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
  const pickedIndex = 0;

  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: threadId, action: 'pick', angle_id: pickedIndex, content: 'Start with the 90-day stat' });
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'awaiting_approval', draft: 'Ship small, learn fast — a 90-day story.', thread_id: threadId, post_id: 'post-1' }),
    });
  }, log);

  await page.getByRole('button', { name: 'Draft for LinkedIn' }).nth(pickedIndex).click();
  await page.getByPlaceholder(/Start with the UPI vs Visa stat/).fill('Start with the 90-day stat');
  await page.getByRole('button', { name: 'Use this' }).click();

  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  expect(log.count('POST', '/api/ai/resume')).toBe(1);
  await sse.close();
});

test('typing in the composer while the angles are unresolved routes through none_fit on the SAME thread', async ({ supabaseAuthPage: page }) => {
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
