import { test, expect } from '@playwright/test';
import {
  mockSupabaseAuthSurface,
  mockSupabaseLogin,
  mockSupabaseSignup,
  TEST_USER,
} from './fixtures/authFixtures';
import { mockGetSessions, mockGetProfile, mockLinkedInStatus, makeCallLog } from './fixtures/mockRouter';

/**
 * Supabase-mode auth tests — runs against the `dist-e2e-supabase` build
 * (VITE_AUTH_MODE=supabase, the prod default). See fixtures/authFixtures.ts
 * for how real supabase-js is kept running in the browser with only its
 * "auth/v1" HTTP calls mocked. Local-mode register/login live in
 * auth.local-auth.spec.ts (separate build, separate project — VITE_AUTH_MODE
 * is inlined at build time, so one Playwright run can't cover both modes
 * against a single served bundle).
 */

test.describe('Register — Supabase mode', () => {
  test('immediate session (autoconfirm) navigates to /onboarding', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    await page.goto('/register');

    await page.getByPlaceholder('Jane Doe').fill('Ada Lovelace');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('At least 6 characters').fill('a-secure-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test('email-confirmation-required shows inline message and does not navigate', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    // No access_token in the body → supabase-js's _sessionResponse() treats
    // this as {user, session: null} (see @supabase/auth-js lib/fetch.js).
    await mockSupabaseSignup(page, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: TEST_USER.id, email: 'ada@example.com', aud: 'authenticated', confirmation_sent_at: new Date().toISOString() }),
      }));

    await page.goto('/register');
    await page.getByPlaceholder('Jane Doe').fill('Ada Lovelace');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('At least 6 characters').fill('a-secure-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText(/Check ada@example.com for a confirmation link/)).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('Login — Supabase mode', () => {
  test('success navigates to /chat', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });

    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/chat$/);
  });

  test('failure shows inline error, no navigation', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    await mockSupabaseLogin(page, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', msg: 'Invalid login credentials', error_description: 'Invalid login credentials' }),
      }));

    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill('wrong-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText(/Invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('RequireAuth', () => {
  const PROTECTED_ROUTES = ['/chat', '/my-work', '/schedule', '/settings', '/agents'];

  for (const route of PROTECTED_ROUTES) {
    test(`anon user hitting ${route} redirects to /`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL('/');
    });
  }

  test('checking state never flashes protected content before resolving', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });

    // Establish a real session via the login flow so supabase-js persists it
    // under its own storage key/format.
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/chat$/);

    // Force the stored session to look near-expiry so the next page load's
    // _recoverAndRefresh() must hit the network before getSession() resolves
    // — the window we need to observe the "checking" (null) render.
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (!key) throw new Error('supabase-js did not persist a session under the expected storage key');
      const stored = JSON.parse(localStorage.getItem(key)!);
      const session = stored.currentSession ?? stored; // format varies slightly by minor version
      session.expires_at = Math.floor(Date.now() / 1000) + 5; // inside EXPIRY_MARGIN_MS
      localStorage.setItem(key, JSON.stringify(stored.currentSession ? stored : session));
    });

    let releaseRefresh: () => void = () => {};
    const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    await page.route((url) => url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'refresh_token', async (route) => {
      await refreshGate;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'refreshed-token', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refreshed-refresh-token',
          user: { id: TEST_USER.id, aud: 'authenticated', role: 'authenticated', email: TEST_USER.email, user_metadata: { username: TEST_USER.username }, app_metadata: {} },
        }),
      });
    });

    const readyText = page.getByText('Ready when you are');
    await page.goto('/chat', { waitUntil: 'commit' });
    // Give the app time to mount and reach the "checking" state (RequireAuth
    // renders null there) — the refresh call stays gated shut throughout.
    await page.waitForTimeout(300);
    await expect(readyText).not.toBeVisible();

    releaseRefresh();
    await expect(readyText).toBeVisible();
  });
});

test.describe('Forgot password (documented gap)', () => {
  test('shows a static message and never calls sendPasswordResetEmail', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    const log = makeCallLog();
    await page.route('**/auth/v1/recover**', (route) => { log.record(route); return route.fulfill({ status: 200, body: '{}' }); });

    await page.goto('/login');
    // Not getByRole: HomePage.jsx's markup wraps both the "Password" label
    // text and this button in one <label>, which makes the browser compute
    // the button's accessible name as "Password" rather than its own text —
    // an existing minor a11y quirk in the app, not something to paper over
    // by "fixing" the selector to a name the button doesn't actually have.
    await page.getByText('Forgot?', { exact: true }).click();

    await expect(page.getByText("Password reset isn't available yet — contact support.")).toBeVisible();
    expect(log.calls.length).toBe(0);
  });
});

test.describe('Google sign-in', () => {
  test('triggers the real googleSignIn() OAuth call path', async ({ page }) => {
    await mockSupabaseAuthSurface(page);
    const authorizeRequest = page.waitForRequest((req) => req.url().includes('/auth/v1/authorize'));

    await page.goto('/login');
    await page.getByRole('button', { name: 'Google' }).click();

    const req = await authorizeRequest;
    expect(req.url()).toContain('provider=google');
  });
});
