import { test, expect } from '@playwright/test';
import { mockSupabaseAuthSurface, TEST_USER } from './fixtures/authFixtures';
import { mockRaw, preset } from './fixtures/mockRouter';

/**
 * ResetPasswordPage.jsx — standalone, not RequireAuth-wrapped. Reaching the
 * real "PASSWORD_RECOVERY" event requires replaying Supabase's PKCE
 * code-exchange handshake exactly, which is fragile to hand-mock reliably.
 * Instead we exercise the component's own documented fallback path — "a
 * valid session at all is good enough" (see the component's comment) — by
 * establishing a real session via a normal login first. This is the same
 * code branch a genuinely-fired PASSWORD_RECOVERY event would also satisfy.
 */

test('no session at all → "Link invalid or expired", links back to /login', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByText('Link invalid or expired')).toBeVisible();
  await page.getByRole('button', { name: 'Back to log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test.describe('with a valid session (getSession() fallback path)', () => {
  async function loginThenGoToReset(page: import('@playwright/test').Page) {
    await mockSupabaseAuthSurface(page);
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/chat$/);
    await page.goto('/reset-password');
  }

  test('shows the new-password form', async ({ page }) => {
    await loginThenGoToReset(page);
    await expect(page.getByText('Set a new password for your account.')).toBeVisible();
  });

  test('rejects a too-short password without calling updatePassword', async ({ page }) => {
    await loginThenGoToReset(page);
    const log: unknown[] = [];
    await mockRaw(page, '**/auth/v1/user**', 'PUT', async (route) => { log.push(1); await route.fulfill({ status: 200, body: '{}' }); });

    await page.getByPlaceholder('New password', { exact: true }).fill('short');
    await page.getByPlaceholder('Confirm new password').fill('short');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText('New password must be at least 8 characters.')).toBeVisible();
    expect(log.length).toBe(0);
  });

  test('rejects mismatched confirmation without calling updatePassword', async ({ page }) => {
    await loginThenGoToReset(page);
    const log: unknown[] = [];
    await mockRaw(page, '**/auth/v1/user**', 'PUT', async (route) => { log.push(1); await route.fulfill({ status: 200, body: '{}' }); });

    await page.getByPlaceholder('New password', { exact: true }).fill('a-long-enough-password');
    await page.getByPlaceholder('Confirm new password').fill('a-different-password');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText("New passwords don't match.")).toBeVisible();
    expect(log.length).toBe(0);
  });

  test('success → Done state → "Continue to Settings" navigates to /settings', async ({ page }) => {
    await loginThenGoToReset(page);
    await mockRaw(page, '**/auth/v1/user**', 'PUT', preset.success({ user: { id: TEST_USER.id } }));

    await page.getByPlaceholder('New password', { exact: true }).fill('a-long-enough-password');
    await page.getByPlaceholder('Confirm new password').fill('a-long-enough-password');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText('Password updated')).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test('backend failure shows an inline error, stays on the form', async ({ page }) => {
    await loginThenGoToReset(page);
    // 400, not 500: supabase-js's fetch layer treats 5xx as a "retryable"
    // class of error and builds its message from the raw response rather
    // than the JSON body (see @supabase/auth-js's handleError) — a 500 here
    // would render as the literal text "{}" instead of our mocked message.
    // A 400-class rejection (e.g. a weak-password validation error) is also
    // the more realistic shape for updateUser() failing anyway.
    await mockRaw(page, '**/auth/v1/user**', 'PUT', preset.error(400, { msg: 'Could not update password. Please try again.' }));

    await page.getByPlaceholder('New password', { exact: true }).fill('a-long-enough-password');
    await page.getByPlaceholder('Confirm new password').fill('a-long-enough-password');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page.getByText('Could not update password. Please try again.')).toBeVisible();
  });
});
