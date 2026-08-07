import { test, expect } from './fixtures/authFixtures';
import { makeCallLog } from './fixtures/mockRouter';

/** AgentsPage.jsx — static "AI team" overview, zero API calls, per CLAUDE.md. */

test('renders 4 hardcoded agent cards with correct active/coming-soon states, and makes zero API calls', async ({ supabaseAuthPage: page }) => {
  // supabaseAuthPage lands on /chat first, whose own mount effects
  // (getSessions/getProfile/getLinkedInStatus) can still be scheduled (not
  // yet dispatched) at the moment we navigate away — a hard page.goto()
  // doesn't reliably cancel them, so they can land just after the new
  // document's routes are registered and get miscounted as AgentsPage's
  // own calls. Recording every call with a timestamp from the start and
  // filtering to only those after the /agents navigation began sidesteps
  // that race entirely, rather than guessing a "long enough" settle delay.
  const log = makeCallLog();
  const timestamps = new Map<number, number>();
  await page.route('**/api/**', (route) => {
    log.record(route);
    timestamps.set(log.calls.length - 1, Date.now());
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  const navigatedAt = Date.now();
  await page.goto('/agents');
  await expect(page.getByText('Your AI Team')).toBeVisible();

  await expect(page.getByText('Research Agent')).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();

  await expect(page.getByText('Writer Agent')).toBeVisible();
  await expect(page.getByText('Drafting', { exact: true })).toBeVisible();

  await expect(page.getByText('SEO Agent')).toBeVisible();
  await expect(page.getByText('Analytics Agent')).toBeVisible();
  // 2 status badges + 2 disabled CTA buttons, both rendering the literal
  // "Coming soon" string (AgentsPage.jsx's AGENTS[].status and .cta).
  await expect(page.getByText('Coming soon')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Coming soon' })).toHaveCount(2);

  await page.waitForTimeout(500); // give any stray effect a chance to fire
  const callsAfterNavigation = [...timestamps.values()].filter((t) => t >= navigatedAt).length;
  expect(callsAfterNavigation).toBe(0);
});

test('Research/Writer CTAs navigate to /chat; SEO/Analytics cards are disabled', async ({ supabaseAuthPage: page }) => {
  await page.goto('/agents');

  await expect(page.getByRole('button', { name: 'Coming soon' }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Coming soon' }).last()).toBeDisabled();

  await page.getByRole('button', { name: 'Ask a research question →' }).click();
  await expect(page).toHaveURL(/\/chat$/);
});

test('Writer CTA also navigates to /chat', async ({ supabaseAuthPage: page }) => {
  await page.goto('/agents');
  await page.getByRole('button', { name: 'Write a post →' }).click();
  await expect(page).toHaveURL(/\/chat$/);
});
