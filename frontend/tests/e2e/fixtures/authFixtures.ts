import { test as base, expect, type Page, type Route } from '@playwright/test';
import { mockGetSessions, mockGetProfile, mockLinkedInStatus } from './mockRouter';

/**
 * Two genuinely different code paths per CLAUDE.md's Authentication Flow:
 *   - local:    attachAuthHeader.js reads localStorage('user_id') and sends
 *               X-User-Id. No supabase-js network traffic at all.
 *   - supabase: attachAuthHeader.js awaits supabase.auth.getSession() and
 *               sends Authorization: Bearer <access_token>.
 *
 * Rather than hand-crafting supabase-js's internal localStorage session
 * format (version-fragile), the supabase fixture lets the REAL supabase-js
 * client run in the browser and mocks the HTTP calls it makes to the
 * "auth/v1" endpoints — the library then manages its own storage exactly as it
 * would against a real project, so getSession() on subsequent page loads
 * "just works" without us reverse-engineering its storage schema.
 */

export const TEST_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'e2e-user@example.com',
  password: 'correct-horse-battery-staple',
  username: 'e2e-user',
};

function accessToken() {
  return 'mock-access-token';
}

function mockSession(overrides: Record<string, unknown> = {}) {
  return {
    access_token: accessToken(),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'mock-refresh-token',
    user: {
      id: TEST_USER.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: TEST_USER.email,
      user_metadata: { username: TEST_USER.username },
      app_metadata: {},
      created_at: new Date().toISOString(),
    },
    ...overrides,
  };
}

/**
 * Wires the full "auth/v1" surface supabase-js touches during a normal
 * session lifecycle (login, token refresh, user fetch, logout). Call this
 * once per test before any supabase.auth.* call. Individual tests can
 * page.route() a more specific handler afterwards (Playwright uses the most
 * recently registered matching route) to override one endpoint, e.g. to
 * simulate invalid credentials on /token?grant_type=password.
 */
export async function mockSupabaseAuthSurface(page: Page) {
  await page.route('**/auth/v1/token**', async (route) => {
    const url = new URL(route.request().url());
    const grantType = url.searchParams.get('grant_type');
    if (grantType === 'refresh_token') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession()) });
    }
    // Default: password grant succeeds. Tests wanting failure override this
    // route afterwards with a more specific page.route() call.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession()) });
  });

  await page.route('**/auth/v1/signup**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSession()),
    });
  });

  await page.route('**/auth/v1/user**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSession().user) });
  });

  await page.route('**/auth/v1/logout**', async (route) => route.fulfill({ status: 204, body: '' }));

  // signInWithOAuth() builds an /authorize URL and navigates the browser to
  // it — intercept so the test never actually leaves to a real Google/
  // Supabase domain; fulfilling with a small HTML page is enough to prove
  // the call fired without simulating the rest of a real OAuth round trip.
  await page.route('**/auth/v1/authorize**', async (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>mock oauth provider</body></html>' }));
}

/** Registers a one-off override for the password-grant login call. */
export async function mockSupabaseLogin(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route((url) => url.pathname.endsWith('/auth/v1/token') && url.searchParams.get('grant_type') === 'password', handler);
}

/** Registers a one-off override for the signUp() call. */
export async function mockSupabaseSignup(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route('**/auth/v1/signup**', handler);
}

async function seedLocalAuthStorage(page: Page) {
  await page.addInitScript(([userId, username]) => {
    window.localStorage.setItem('user_id', userId as string);
    window.localStorage.setItem('username', username as string);
  }, [TEST_USER.id, TEST_USER.username]);
}

type Fixtures = {
  /** A page already authenticated under VITE_AUTH_MODE=local (X-User-Id header). */
  localAuthPage: Page;
  /** A page already authenticated under VITE_AUTH_MODE=supabase (real supabase-js, mocked HTTP). */
  supabaseAuthPage: Page;
};

export const test = base.extend<Fixtures>({
  localAuthPage: async ({ page }, use) => {
    await seedLocalAuthStorage(page);
    // Baseline mocks most pages touch on mount — individual tests can
    // re-mock these with page.route() to override (last-registered wins).
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });
    await use(page);
  },

  supabaseAuthPage: async ({ page }, use) => {
    await mockSupabaseAuthSurface(page);
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });

    // Real UI login so supabase-js persists a genuine session via its own
    // storage mechanism — see the module doc comment for why we don't
    // hand-craft the localStorage format instead.
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill(TEST_USER.password);
    // Scoped to the form — the tab segment above it also renders a "Log in"
    // button (HomePage.jsx's tab copy and submit copy collide on this string).
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/chat$/);

    await use(page);
  },
});

export { expect };
