import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Fake upstream (tests/smoke/fake_upstream.py): Gemini, Supabase JWKS, Google OAuth + Drive. */
export const FAKE = 'http://127.0.0.1:8090';

/** Sign in through the real login form as a brand-new user. supabase-js's
 *  calls are answered here, with a JWT the backend verifies for real. */
export async function signIn(page: Page, request: APIRequestContext) {
  const userId = crypto.randomUUID();
  const { access_token } = await (await request.get(`${FAKE}/__control/token/${userId}`)).json();
  const user = {
    id: userId, aud: 'authenticated', role: 'authenticated', email: `${userId}@smoke.local`,
    user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString(),
  };
  const session = {
    access_token, token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'smoke-refresh', user,
  };
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: session }));
  await page.route('**/auth/v1/user**', route => route.fulfill({ json: user }));
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));

  await page.goto('/login');
  await page.locator('form input[type="email"]').fill(user.email);
  await page.locator('form input[type="password"]').fill('smoke-password');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/home$/);
}
