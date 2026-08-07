import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockResumeAI, mockGetProfile, mockLinkedInStatus, preset, makeCallLog } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo } from './fixtures/sseHelper';
import type { Page } from '@playwright/test';

/**
 * Degraded-backend behavior — the priority tier per the suite's brief. Several
 * of these tests deliberately assert a *gap* (no timeout, no retry cap, no
 * distinct error state) rather than an ideal — see tests/e2e/README.md's
 * known-gaps table for which is which.
 */

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
  await page.goto('/chat');
});

test('/stream returns 500 immediately → error surfaces, no stuck "working" spinner', async ({ page }) => {
  await page.route('**/api/ai/stream', (route) => route.fulfill({ status: 500, body: 'Internal Server Error' }));

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Hello');
  await page.getByTitle('Send').click();

  await expect(page.getByText('Server error 500')).toBeVisible();
  await expect(page.getByText('Working on it…')).not.toBeVisible();
});

test('KNOWN GAP: /stream opens and never sends another event — no client-side timeout exists', async ({ page }) => {
  // Per CLAUDE.md's Known Gaps, nothing bounds a hung researcher/web_search
  // call. This test pins the current stuck-forever behavior so a future fix
  // has a red/green marker.
  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Research something slow');
  await page.getByTitle('Send').click();
  await sse.firstRequest;

  await page.waitForTimeout(2000);
  await expect(page.getByText('Working on it…')).toBeVisible(); // still "working" — nothing ever times it out
  await sse.close();
});

test('/resume 500 while a draft is paused for approval — the paused draft is not silently wiped', async ({ page }) => {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken('This is the paused draft text.');
  sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  await mockResumeAI(page, preset.error(500, { detail: 'boom' }));
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Could not save the draft. Please try again.')).toBeVisible();
  // The draft text and Approve/Decline controls both survive the failure.
  await expect(page.getByText('This is the paused draft text.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await sse.close();
});

test('/resume 403 (stale/non-owned thread) — inline error, no crash, no automatic retry', async ({ page }) => {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken('Draft text.');
  sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  const log = makeCallLog();
  await mockResumeAI(page, preset.error(403, { detail: 'Not the owner of this thread' }), log);
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Could not save the draft. Please try again.')).toBeVisible();

  await page.waitForTimeout(1000);
  expect(log.calls.length).toBe(1); // no silent retry loop
  await sse.close();
});

test('malformed/truncated SSE chunk does not throw an uncaught exception — the page stays interactive', async ({ page }) => {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Trigger a malformed stream');
  await page.getByTitle('Send').click();
  await sse.firstRequest;

  sse.sendRaw('data: {"type":"token","content":"cut off mid-JSO'); // never closed, never \n\n-terminated
  sse.end(); // backend finishes without ever sending a valid terminator or `done`

  await page.waitForTimeout(500);
  expect(pageErrors).toEqual([]);

  // Prove the page is still interactive — the composer still accepts input.
  const box = page.getByPlaceholder('Drop a thought, or ask to research and write…');
  await box.fill('still typing works');
  await expect(box).toHaveValue('still typing works');
  await sse.close();
});

test.describe('getSessions() degraded states', () => {
  test('empty array and a 500 failure render identically — no distinct error UI for a failed session list (documented gap)', async ({ page }) => {
    // Re-navigate per sub-case since beforeEach already mocked an empty list.
    await mockGetSessions(page, preset.error(500, { detail: 'boom' }));
    await page.goto('/chat');
    await expect(page.getByText('What should we work on?')).toBeVisible(); // same as the empty-array case — no error banner anywhere
  });

  test('a slow getSessions() response does not block the rest of the page from rendering', async ({ page }) => {
    await mockGetSessions(page, preset.slow(2000, { sessions: [{ session_id: 's1', title: 'Late chat', last_active_at: new Date().toISOString() }] }));
    await page.goto('/chat');

    await expect(page.getByText('What should we work on?')).toBeVisible(); // composer/page usable immediately
    await expect(page.getByText('Late chat')).not.toBeVisible();
    await expect(page.getByText('Late chat')).toBeVisible({ timeout: 3000 }); // appears once the slow call resolves
  });
});

test('KNOWN GAP: a mocked 401 mid-session does not redirect to /login — no response interceptor exists for it', async ({ page }) => {
  // attachAuthHeader.js only has a REQUEST interceptor (attaches the token);
  // there is no response interceptor anywhere that reacts to 401s. This
  // pins that a 401 is handled exactly like any other error, not specially.
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken('Draft.');
  sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  await mockResumeAI(page, preset.error(401, { detail: 'Token expired' }));
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Could not save the draft. Please try again.')).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/); // no redirect to /login
  await sse.close();
});

test('server closes the SSE socket abruptly (no `error` event) — no crash, no silent infinite retry', async ({ page }) => {
  // streamQuery()'s catch block treats any non-AbortError fetch failure as
  // onError, which *should* distinguish this from the clean-end-without-
  // `done` case (which stays stuck in "Working on it…" forever, see the
  // hang test above) — but the exact rejection behavior of a destroyed
  // response stream can differ across browser engines, so this test only
  // asserts the browser-independent guarantees: no uncaught exception, no
  // repeated automatic retry, and the composer stays usable either way.
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const sse = await startSseServer();
  let requestCount = 0;
  await page.route('**/api/ai/stream', (route) => { requestCount++; return route.continue({ url: sse.url }); });

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Trigger an abrupt close');
  await page.getByTitle('Send').click();
  await sse.firstRequest;

  sse.sendToken('partial answer');
  sse.closeAbruptly(); // destroys the socket — the fetch reader's next read() rejects (or the browser reports a clean EOF, depending on engine)

  await page.waitForTimeout(1500);
  expect(pageErrors).toEqual([]);
  expect(requestCount).toBe(1); // no automatic reconnect/retry loop

  const box = page.getByPlaceholder('Drop a thought, or ask to research and write…');
  await box.fill('still interactive');
  await expect(box).toHaveValue('still interactive');
  await sse.close();
});
