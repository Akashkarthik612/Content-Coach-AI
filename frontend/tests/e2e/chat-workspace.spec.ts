import { test, expect } from './fixtures/authFixtures';
import {
  mockGetSessions, mockGetProfile, mockLinkedInStatus, mockLinkedInAuthUrl, mockPublishToLinkedIn,
  mockResumeAI, mockRefineAI, mockGetVersions, mockRaw, preset, makeCallLog,
} from './fixtures/mockRouter';
import { startSseServer, routeStreamTo, type SseServer } from './fixtures/sseHelper';
import type { Page } from '@playwright/test';

/** WorkspaceView — the post-draft approval/publish surface inside ChatPage.jsx. */

const THREAD_ID = 'thread-ws-1';
const POST_ID = 'post-ws-1';
const DRAFT_TEXT = 'Shipping small beats shipping big. Here is why.';

async function reachWorkspace(page: Page): Promise<SseServer> {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post about shipping small');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken(DRAFT_TEXT);
  sse.sendDone({ status: 'awaiting_approval', thread_id: THREAD_ID, post_id: POST_ID });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  return sse;
}

async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    (window as any).__copied = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (text: string) => { (window as any).__copied.push(text); return Promise.resolve(); } },
      configurable: true,
    });
  });
}

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
  await page.goto('/chat');
});

test('opens automatically once a draft exists, and via "Open Workspace →" after approving', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  await mockResumeAI(page, preset.success({ post_id: POST_ID, answer: 'Saved.' }));

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved · saved to your vault')).toBeVisible();

  await page.getByRole('button', { name: 'Chat' }).click(); // back to chat list
  await expect(page.getByText('Approved · saved to your vault')).toBeVisible();

  await page.getByRole('button', { name: 'Open Workspace →' }).click();
  await expect(page.getByText(DRAFT_TEXT)).toBeVisible();
  await sse.close();
});

test.describe('Preview mode profession-line fallback', () => {
  test('uses profile.profession when present', async ({ supabaseAuthPage: page }) => {
    await mockGetProfile(page, { profession: 'Product Manager' });
    const sse = await reachWorkspace(page);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Product Manager')).toBeVisible();
    await sse.close();
  });

  test('falls back to profile.role when profession is absent', async ({ supabaseAuthPage: page }) => {
    await mockGetProfile(page, { profession: null, role: 'Engineer' });
    const sse = await reachWorkspace(page);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Engineer')).toBeVisible();
    await sse.close();
  });

  test('falls back to "Creator on Honne" when getProfile() 404s to null', async ({ supabaseAuthPage: page }) => {
    await mockGetProfile(page, null); // null => 404 preset
    const sse = await reachWorkspace(page);
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Creator on Honne')).toBeVisible();
    await sse.close();
  });
});

test('Refine panel calls refineAI() only — never /stream or /resume — and replaces the draft text', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  const refineLog = makeCallLog();
  const streamHits = makeCallLog();
  const resumeHits = makeCallLog();
  await mockRefineAI(page, preset.success({ refined_draft: 'A punchier version of the draft.' }), refineLog);
  await mockRaw(page, '**/api/ai/resume', 'POST', preset.success({}), resumeHits);

  await page.getByPlaceholder('Refine the draft…').fill('Make the hook stronger');
  await page.getByPlaceholder('Refine the draft…').press('Enter');

  await expect(page.getByText('A punchier version of the draft.')).toBeVisible();
  expect(refineLog.calls.length).toBe(1);
  expect(refineLog.calls[0].postData).toMatchObject({ draft: DRAFT_TEXT, note: 'Make the hook stronger' });
  expect(resumeHits.calls.length).toBe(0);
  expect(streamHits.calls.length).toBe(0);
  await sse.close();
});

test('Approve with unchanged text calls resumeAI(threadId, "approved")', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: THREAD_ID, action: 'approved' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ post_id: POST_ID }) });
  }, log);

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved · saved to your vault')).toBeVisible();
  expect(log.calls.length).toBe(1);
  await sse.close();
});

test('Approve with edited text calls resumeAI(threadId, "edited", docText)', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  const editedText = DRAFT_TEXT + ' Edited by the user.';
  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: THREAD_ID, action: 'edited', content: editedText });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ post_id: POST_ID }) });
  }, log);

  const textarea = page.getByPlaceholder('Write your post…');
  await textarea.fill(editedText);
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Saved with your edits')).toBeVisible();
  expect(log.calls.length).toBe(1);
  await sse.close();
});

test('Decline calls resumeAI(threadId, "rejected")', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({ thread_id: THREAD_ID, action: 'rejected' });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  }, log);

  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(page.getByText('Declined')).toBeVisible(); // wsDecline navigates back to chat
  expect(log.calls.length).toBe(1);
  await sse.close();
});

test('rapid double-click Approve — KNOWN GAP: fires two resume calls, no debounce guard exists', async ({ supabaseAuthPage: page }) => {
  // Unlike AngleCard's "Draft for LinkedIn" (disabled={picking}), WorkspaceView's
  // Approve button (ChatPage.jsx's wsApprove) has no pending/disabled state at
  // all — this test pins the CURRENT (buggy) behavior per this suite's mandate
  // to characterize what exists, not what's desired. See tests/e2e/README.md.
  const sse = await reachWorkspace(page);
  const log = makeCallLog();
  await mockResumeAI(page, async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ post_id: POST_ID }) });
  }, log);

  await page.getByRole('button', { name: 'Approve' }).dblclick();
  await expect(page.getByText('Approved · saved to your vault')).toBeVisible();

  expect(log.calls.length).toBe(2);
  await sse.close();
});

test('History button fetches and renders version list', async ({ supabaseAuthPage: page }) => {
  const sse = await reachWorkspace(page);
  await mockGetVersions(page, [
    { id: 'v1', version_number: 1, change_summary: 'Initial draft' },
    { id: 'v2', version_number: 2, change_summary: 'Tightened the hook' },
  ]);

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('v1 — Initial draft')).toBeVisible();
  await expect(page.getByText('v2 — Tightened the hook')).toBeVisible();
  await sse.close();
});

test.describe('LinkedIn connect / publish', () => {
  test('shows Connect when disconnected, and starts the OAuth redirect', async ({ supabaseAuthPage: page }) => {
    await mockLinkedInStatus(page, { connected: false });
    const sse = await reachWorkspace(page);
    // Port 1 is on browsers' "unsafe ports" blocklist (WebKit refuses to
    // navigate there at all) — use an ordinary-looking mock host instead.
    await mockLinkedInAuthUrl(page, preset.success({ auth_url: 'https://mock-linkedin-oauth.example.com/oauth/mock-authorize' }));
    // connectLinkedIn() does a real window.location.href assignment — fulfill
    // the resulting top-level navigation so the test never leaves to a real
    // external domain.
    await page.route('**/oauth/mock-authorize**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>mock linkedin authorize</body></html>' }));

    await page.getByRole('button', { name: /Connect LinkedIn/ }).click();
    await page.waitForURL('**/oauth/mock-authorize**');
    await sse.close();
  });

  test('shows Publish when connected; success path', async ({ supabaseAuthPage: page }) => {
    await mockLinkedInStatus(page, { connected: true, display_name: 'Ada' });
    const sse = await reachWorkspace(page);
    await mockPublishToLinkedIn(page, preset.success({ published: true }));

    await page.getByRole('button', { name: /Publish to LinkedIn/ }).click();
    await expect(page.getByText('Published to LinkedIn.')).toBeVisible();
    await sse.close();
  });

  test('shows Publish when connected; failure path surfaces the reason inline', async ({ supabaseAuthPage: page }) => {
    await mockLinkedInStatus(page, { connected: true, display_name: 'Ada' });
    const sse = await reachWorkspace(page);
    await mockPublishToLinkedIn(page, preset.success({ published: false, reason: 'Token expired — reconnect required.' }));

    await page.getByRole('button', { name: /Publish to LinkedIn/ }).click();
    await expect(page.getByText('Token expired — reconnect required.')).toBeVisible();
    await sse.close();
  });
});

test('Copy button copies the current draft text', async ({ supabaseAuthPage: page }) => {
  await stubClipboard(page);
  await mockGetSessions(page, []);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
  await page.goto('/chat');
  const sse = await reachWorkspace(page);

  await page.getByRole('button', { name: 'Copy' }).click();
  const copied = await page.evaluate(() => (window as any).__copied);
  expect(copied).toContain(DRAFT_TEXT);
  await expect(page.getByText('Copied')).toBeVisible();
  await sse.close();
});
