import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockGetProfile, mockLinkedInStatus, mockResumeAI, preset } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo } from './fixtures/sseHelper';

/**
 * Section 5 priority — verifying, not assuming, whether streamQuery() sends
 * the right auth header in Supabase mode. Local-mode's contrast case (which
 * should work correctly today) lives in auth-boundary.local-auth.spec.ts —
 * separate build/project, see playwright.config.ts.
 */

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });
});

test('KNOWN GAP: under VITE_AUTH_MODE=supabase, streamQuery() does NOT send Authorization: Bearer — it sends X-User-Id instead', async ({ supabaseAuthPage: page }) => {
  // ai.js's streamQuery() builds its own fetch() headers manually, reading
  // localStorage('user_id') directly — it never goes through
  // attachAuthHeader.js's VITE_AUTH_MODE branch the way queryAI/resumeAI/
  // every other call in that file does (see claude_ui.md's ai.js row). In
  // Supabase mode the backend's _get_current_user_supabase() expects a JWT
  // via Authorization: Bearer — this test proves the header it actually
  // gets isn't that, using the real header capture from a live local SSE
  // server (see sseHelper.ts's firstRequest) rather than asserting against
  // a guess. If this test ever starts failing because Authorization IS now
  // present, that means the bug was fixed — update this test's expectations
  // (and claude_ui.md's ai.js row) rather than "fixing" the assertion to
  // match old behavior.
  await page.goto('/chat');
  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Does this send a Bearer token?');
  await page.getByTitle('Send').click();

  const { headers } = await sse.firstRequest;
  expect(headers['authorization']).toBeUndefined();
  expect(headers['x-user-id']).toBeTruthy();

  sse.sendDone({ status: 'complete', answer: 'noted' });
  sse.end();
  await sse.close();
});

test('every OTHER /api/ai/* call (resumeAI, via attachAuthHeader.js) correctly sends Authorization: Bearer in Supabase mode', async ({ supabaseAuthPage: page }) => {
  // Contrast case, in the same file, proving the gap above is specific to
  // streamQuery's hand-rolled fetch — not a blanket "Supabase mode is
  // broken" problem. resumeAI goes through the shared axios instance with
  // attachAuthHeader.js's interceptor, which does branch correctly.
  await page.goto('/chat');
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken('Draft.');
  sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  let capturedAuth: string | undefined;
  await mockResumeAI(page, async (route) => {
    capturedAuth = route.request().headers()['authorization'];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ post_id: 'post-1' }) });
  });
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved · saved to your vault')).toBeVisible();

  expect(capturedAuth).toMatch(/^Bearer /);
  await sse.close();
});

test('session expiry during an open interrupt — pins current behavior (request just fails, no special handling)', async ({ supabaseAuthPage: page }) => {
  await page.goto('/chat');
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
  await page.getByTitle('Send').click();
  await sse.firstRequest;
  sse.sendToken('Draft.');
  sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
  sse.end();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

  // Simulate the token having expired server-side by now — resume 401s.
  await mockResumeAI(page, preset.error(401, { detail: 'JWT expired' }));
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Could not save the draft. Please try again.')).toBeVisible();
  await expect(page).toHaveURL(/\/chat$/); // no redirect to /login, no session-refresh retry
  await sse.close();
});
