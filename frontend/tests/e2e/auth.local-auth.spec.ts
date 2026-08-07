import { test, expect } from '@playwright/test';
import { mockGetSessions, mockGetProfile, mockLinkedInStatus, mockRaw, preset, makeCallLog } from './fixtures/mockRouter';

/**
 * Local-mode auth tests — runs ONLY against the `dist-e2e-local` build
 * (VITE_AUTH_MODE=local), via the `local-auth-chromium` Playwright project
 * (see playwright.config.ts's testMatch on `.local-auth.spec.ts`). Talks to
 * backend/auth_local/router.py's POST /api/auth/register and /login — no
 * supabase-js involved at all in this mode.
 */

test.describe('Register — local mode', () => {
  test('full name is passed through as username, navigates to /onboarding', async ({ page }) => {
    const log = makeCallLog();
    await mockRaw(page, '**/api/auth/register', 'POST', preset.success({ user_id: 'u1', username: 'Ada Lovelace', email: 'ada@example.com' }), log);

    await page.goto('/register');
    await page.getByPlaceholder('Jane Doe').fill('Ada Lovelace');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('At least 6 characters').fill('a-secure-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/onboarding$/);
    const call = log.calls[0];
    expect(call.postData).toMatchObject({ username: 'Ada Lovelace', email: 'ada@example.com', password: 'a-secure-password' });
  });

  test('conflict (409) shows inline error, stays on /register', async ({ page }) => {
    await mockRaw(page, '**/api/auth/register', 'POST', preset.error(409, { detail: 'Username or email already taken' }));

    await page.goto('/register');
    await page.getByPlaceholder('Jane Doe').fill('Ada Lovelace');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('At least 6 characters').fill('a-secure-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText('Username or email already taken')).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('Login — local mode', () => {
  test('success navigates to /chat', async ({ page }) => {
    await mockRaw(page, '**/api/auth/login', 'POST', preset.success({ user_id: 'u1', username: 'ada', email: 'ada@example.com' }));
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });

    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('••••••••').fill('a-secure-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL(/\/chat$/);
    expect(await page.evaluate(() => localStorage.getItem('user_id'))).toBe('u1');
  });

  test('invalid credentials (401) shows inline error, no navigation', async ({ page }) => {
    await mockRaw(page, '**/api/auth/login', 'POST', preset.error(401, { detail: 'Incorrect username or password' }));

    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('ada@example.com');
    await page.getByPlaceholder('••••••••').fill('wrong-password');
    await page.locator('form button[type="submit"]').click();

    await expect(page.getByText('Incorrect username or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('RequireAuth — local mode', () => {
  test('user_id present in localStorage authenticates synchronously', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('user_id', 'u1'));
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });

    await page.goto('/chat');
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('no user_id redirects to /', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL('/');
  });
});
