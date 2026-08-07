import { test, expect } from './fixtures/authFixtures';
import { mockSubmitOnboarding, preset, makeCallLog } from './fixtures/mockRouter';

/**
 * OnboardingPage.jsx — 7-question wizard, client-side flow + a
 * fire-and-forget backend write (submitOnboarding never blocks navigation).
 * Uses the supabaseAuthPage fixture since this page just needs RequireAuth
 * to pass; the wizard itself doesn't branch on auth mode.
 */

test('full wizard flow: forward navigation through all 7 questions to Done', async ({ supabaseAuthPage: page }) => {
  await mockSubmitOnboarding(page);
  await page.goto('/onboarding');

  await expect(page.getByText('Step 1 of 7')).toBeVisible();
  await page.getByRole('button', { name: 'Founder / Owner' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 2 of 7')).toBeVisible();
  await page.getByRole('button', { name: 'SaaS / Tech' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 3 of 7')).toBeVisible(); // role — free text, optional
  await page.getByPlaceholder(/I lead growth/).fill('I lead growth at a B2B SaaS startup.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 4 of 7')).toBeVisible(); // audience — free text, optional
  await page.getByPlaceholder(/Early-stage founders/).fill('Founders and heads of marketing.');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 5 of 7')).toBeVisible(); // goals — multi
  await page.getByRole('button', { name: 'Build authority' }).click();
  await page.getByRole('button', { name: 'Grow my audience' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 6 of 7')).toBeVisible(); // topics — multi
  await page.getByRole('button', { name: 'Startups' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 7 of 7')).toBeVisible(); // style — single
  await page.getByRole('button', { name: 'Conversational' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByText("You're all set")).toBeVisible();
  await expect(page.getByText('Founder / Owner')).toBeVisible();
  await expect(page.getByText('SaaS / Tech')).toBeVisible();
  await expect(page.getByText('Build authority, Grow my audience')).toBeVisible();
  await expect(page.getByText('Conversational')).toBeVisible();

  await page.getByRole('button', { name: 'Start writing →' }).click();
  await expect(page).toHaveURL(/\/chat$/);
});

test('"Skip for now" from the first screen jumps straight to Done with no answers', async ({ supabaseAuthPage: page }) => {
  await mockSubmitOnboarding(page);
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'Skip for now →' }).click();

  await expect(page.getByText("You're all set")).toBeVisible();
  // No summary card at all — SUMMARY_ROWS filters out rows with no value.
  await expect(page.getByText('Profession')).not.toBeVisible();
});

test('"Skip for now" mid-wizard preserves whatever was answered so far', async ({ supabaseAuthPage: page }) => {
  await mockSubmitOnboarding(page);
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'Founder / Owner' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // -> step 2
  await page.getByRole('button', { name: 'Skip for now →' }).click();

  await expect(page.getByText("You're all set")).toBeVisible();
  await expect(page.getByText('Founder / Owner')).toBeVisible();
});

test('finish() navigates to /chat even when submitOnboarding fails', async ({ supabaseAuthPage: page }) => {
  const log = makeCallLog();
  await mockSubmitOnboarding(page, preset.error(500, { detail: 'boom' }), log);
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'Skip for now →' }).click();
  await page.getByRole('button', { name: 'Start writing →' }).click();

  // Fire-and-forget per CLAUDE.md — a failed save never blocks navigation.
  await expect(page).toHaveURL(/\/chat$/);
});

test('finish() sets both localStorage keys', async ({ supabaseAuthPage: page }) => {
  await mockSubmitOnboarding(page);
  await page.goto('/onboarding');

  await page.getByRole('button', { name: 'Founder / Owner' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now →' }).click();
  await page.getByRole('button', { name: 'Start writing →' }).click();
  await expect(page).toHaveURL(/\/chat$/);

  const userId = await page.evaluate(() => localStorage.getItem('user_id'));
  const onboardedFlag = await page.evaluate((uid) => localStorage.getItem(`cc_onboarded_${uid}`), userId);
  const answers = await page.evaluate(() => localStorage.getItem('onboarding_answers'));
  expect(onboardedFlag).toBe('1');
  expect(answers && JSON.parse(answers)).toMatchObject({ profession: 'Founder / Owner' });
});

test('no server-side enforcement — a user can reach /chat without visiting /onboarding at all', async ({ supabaseAuthPage: page }) => {
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/chat$/);
});
