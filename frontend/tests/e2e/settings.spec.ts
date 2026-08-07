import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockDeleteSession, mockAccountSettings, mockRaw, preset, makeCallLog } from './fixtures/mockRouter';

/**
 * SettingsPage.jsx — Profile (email/username), Security (password), Session
 * & plan. The three rows render their own "Change" button in a fixed DOM
 * order — Email, then Username, then Password — so `.nth(0/1/2)` reliably
 * picks the right one without needing a brittle DOM-structure query.
 */

const EMAIL_CHANGE_BTN = 0;
const USERNAME_CHANGE_BTN = 1;
const PASSWORD_CHANGE_BTN = 2;

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
});

test('displays email + username from getAccountSettings()', async ({ supabaseAuthPage: page }) => {
  await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
  await page.goto('/settings');

  await expect(page.getByText('ada@example.com')).toBeVisible();
  await expect(page.getByText('@ada')).toBeVisible();
});

test('fetch failure shows an explicit inline error, no silent fallback', async ({ supabaseAuthPage: page }) => {
  await mockAccountSettings(page, preset.error(500, { detail: 'boom' }));
  await page.goto('/settings');

  await expect(page.getByText('Unable to load account settings. Server may be unavailable.')).toBeVisible();
});

test.describe('email change', () => {
  test('success shows the pending-confirmation toast, not an instant change', async ({ supabaseAuthPage: page }) => {
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    await mockRaw(page, '**/auth/v1/user**', 'PUT', preset.success({ user: { id: 'u1', email: 'new@example.com' } }));
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Change' }).nth(EMAIL_CHANGE_BTN).click();
    await page.getByPlaceholder('you@example.com').fill('new@example.com');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Confirmation link sent — check your new inbox to finish the change')).toBeVisible();
  });

  test('failure shows an inline error', async ({ supabaseAuthPage: page }) => {
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    await mockRaw(page, '**/auth/v1/user**', 'PUT', preset.error(400, { msg: 'Email address is invalid' }));
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Change' }).nth(EMAIL_CHANGE_BTN).click();
    await page.getByPlaceholder('you@example.com').fill('bad@example.com');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Email address is invalid')).toBeVisible();
  });
});

test.describe('password change', () => {
  test('"Send reset link" calls sendPasswordResetEmail, never sets the password directly here', async ({ supabaseAuthPage: page }) => {
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    const recoverLog = makeCallLog();
    const updateLog = makeCallLog();
    await mockRaw(page, '**/auth/v1/recover**', 'POST', preset.success({}), recoverLog);
    await mockRaw(page, '**/auth/v1/user**', 'PUT', preset.success({ user: {} }), updateLog);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Change' }).nth(PASSWORD_CHANGE_BTN).click();
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByText('Check your inbox')).toBeVisible();
    expect(recoverLog.calls.length).toBe(1);
    expect(updateLog.calls.length).toBe(0);
  });

  test('failure to send shows an inline error', async ({ supabaseAuthPage: page }) => {
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    // 400, not 500: supabase-js treats 5xx as a "retryable" error class and
    // builds its message from the raw response rather than the JSON body
    // (see @supabase/auth-js's handleError) — a 500 here would render as
    // the literal text "{}" instead of our mocked message.
    await mockRaw(page, '**/auth/v1/recover**', 'POST', preset.error(400, { msg: 'Something went wrong' }));
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Change' }).nth(PASSWORD_CHANGE_BTN).click();
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByText(/Something went wrong|Could not send reset link/)).toBeVisible();
  });
});

test('username change writes to localStorage only — zero backend calls (documented gap)', async ({ supabaseAuthPage: page }) => {
  await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
  await page.goto('/settings');
  // getAccountSettings() fires legitimately on mount — only start counting
  // once the page has settled, so this measures the username-change
  // interaction specifically, not the page's own initial load.
  await expect(page.getByText('ada@example.com')).toBeVisible();
  let backendCalls = 0;
  await page.route('**/api/profile/**', (route) => { backendCalls++; return route.fulfill({ status: 200, body: '{}' }); });

  await page.getByRole('button', { name: 'Change' }).nth(USERNAME_CHANGE_BTN).click();
  await page.getByPlaceholder('Your username').fill('new-handle');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Username updated')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('username'))).toBe('new-handle');
  expect(backendCalls).toBe(0);
});

test('cancel subscription shows a toast with zero backend calls', async ({ supabaseAuthPage: page }) => {
  await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
  await page.goto('/settings');
  // Let mount-time calls (getAccountSettings, getSessions) settle before
  // counting — those are expected; the cancel-subscription flow itself
  // should add zero more.
  await expect(page.getByText('ada@example.com')).toBeVisible();
  let backendCalls = 0;
  await page.route('**/api/**', (route) => { backendCalls++; return route.fulfill({ status: 200, body: '{}' }); });

  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await page.getByRole('button', { name: 'Yes, cancel subscription' }).click();

  await expect(page.getByText('Subscription cancellation scheduled')).toBeVisible();
  expect(backendCalls).toBe(0);
});

test('logout clears localStorage and navigates to /login', async ({ supabaseAuthPage: page }) => {
  await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
  await page.goto('/settings');

  await page.getByRole('button', { name: 'Log out' }).click();

  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test.describe('sidebar delete (same behavior as ChatPage, scoped to this page)', () => {
  test('optimistic removal reverts on failure', async ({ supabaseAuthPage: page }) => {
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    await mockGetSessions(page, [{ session_id: 's1', title: 'A settings-page chat', last_active_at: new Date().toISOString() }]);
    // Slowed deliberately so the removal is observable before the revert lands.
    await mockDeleteSession(page, preset.slow(300, { detail: 'boom' }, 500));
    await page.goto('/settings');

    await page.getByTitle('Delete').click();
    await expect(page.getByText('A settings-page chat')).not.toBeVisible();
    await expect(page.getByText('A settings-page chat')).toBeVisible({ timeout: 2000 });
  });
});
