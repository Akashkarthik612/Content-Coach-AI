import { test, expect } from '@playwright/test';
import { mockGetSessions, mockGetProfile, mockLinkedInStatus } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo } from './fixtures/sseHelper';

/**
 * Contrast case for auth-boundary.spec.ts's Supabase-mode gap: under
 * VITE_AUTH_MODE=local, streamQuery()'s hand-rolled X-User-Id header is
 * exactly the mechanism the whole app is supposed to use in this mode — so
 * this path is expected to, and does, work correctly today. Runs against
 * dist-e2e-local via the local-auth-chromium project.
 */

test('local-mode X-User-Id header is correctly sent on streamQuery', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('user_id', 'local-user-42');
    window.localStorage.setItem('username', 'local-user');
  });
  await mockGetSessions(page, []);
  await mockGetProfile(page, null);
  await mockLinkedInStatus(page, { connected: false });

  await page.goto('/chat');
  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Hello from local mode');
  await page.getByTitle('Send').click();

  const { headers } = await sse.firstRequest;
  expect(headers['x-user-id']).toBe('local-user-42');
  expect(headers['authorization']).toBeUndefined();

  sse.sendDone({ status: 'complete', answer: 'ok' });
  sse.end();
  await sse.close();
});
