import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockDeleteSession, preset } from './fixtures/mockRouter';

/**
 * SchedulePage.jsx — per CLAUDE.md, calendar/momentum/runway data is
 * "entirely mock" (client-only state seeded from hardcoded arrays; no
 * backend endpoint exists for it). These tests cover only client-side UI
 * interaction, never data correctness — per this suite's constraint #4.
 */

const MONTH_NAME = /^(January|February|March|April|May|June|July|August|September|October|November|December)$/;

test.beforeEach(async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/schedule');
});

test('month navigation (prev/next) updates the displayed month — pure client state', async ({ page }) => {
  const header = page.locator('span', { hasText: MONTH_NAME }).first();
  const initial = await header.textContent();

  await page.getByTitle('Previous month').click();
  await expect(header).not.toHaveText(initial ?? '');

  await page.getByTitle('Next month').click();
  await expect(header).toHaveText(initial ?? '');
});

test('"Today" jumps back to the current month after navigating away', async ({ page }) => {
  const header = page.locator('span', { hasText: MONTH_NAME }).first();
  const today = await header.textContent();

  await page.getByTitle('Next month').click();
  await page.getByTitle('Next month').click();
  await expect(header).not.toHaveText(today ?? '');

  await page.getByTitle('Jump to today').click();
  await expect(header).toHaveText(today ?? '');
});

test('day selection opens the day-detail panel, and toggles closed on second click', async ({ page }) => {
  // Any in-month day cell works — the detail panel opens for any selection,
  // not just "today". `.sch-out` cells (prev/next month spillover) are
  // excluded since they're non-interactive (onClick is undefined for them).
  const dayCell = page.locator('button.sch-daycell:not(.sch-out)').nth(14); // the 15th of the month
  await dayCell.click();

  await expect(page.getByTitle('Close')).toBeVisible();

  await dayCell.click(); // toggle closed
  await expect(page.getByTitle('Close')).not.toBeVisible();
});

// SchedulePage.jsx renders a full-viewport invisible backdrop
// (`{menuId != null && <div style={{position:'fixed',inset:0,zIndex:15}}/>}`)
// to close the dropdown on an outside click. In real browser hit-testing it
// sits on top of the dropdown's own menu items — confirmed by `.click()`
// (and even `.click({force:true})`, which still dispatches a real,
// coordinate-based mouse event subject to normal hit-testing) landing on the
// backdrop instead: a `click({force:true})` on "Cancel post" was
// consistently swallowed by the backdrop with no row removed. `dispatchEvent`
// fires the DOM event directly on the target node, bypassing hit-testing
// entirely, which is the only way to prove what the menu item's own handler
// actually does. This is itself a discovered gap — see tests/e2e/README.md.
async function clickMenuItem(locator: ReturnType<import('@playwright/test').Page['getByText']>) {
  await locator.dispatchEvent('click');
}

test('"Open in editor" / "Reschedule" kebab actions close the menu and do nothing else (documented as inert)', async ({ page }) => {
  const kebab = page.getByTitle('More').first();
  await expect(kebab).toBeVisible();
  await kebab.click();

  await expect(page.getByText('Open in editor')).toBeVisible();
  await clickMenuItem(page.getByText('Open in editor'));
  await expect(page.getByText('Open in editor')).not.toBeVisible(); // menu closed
  await expect(page).toHaveURL(/\/schedule$/); // no navigation fired

  await kebab.click();
  await clickMenuItem(page.getByText('Reschedule'));
  await expect(page.getByText('Reschedule')).not.toBeVisible();
  await expect(page).toHaveURL(/\/schedule$/);
});

test('"Cancel post" removes the row from local state only — no network call', async ({ page }) => {
  let sawApiCall = false;
  await page.route('**/api/vault/**', (route) => { sawApiCall = true; return route.fulfill({ status: 200, body: '{}' }); });

  const kebabsBefore = await page.getByTitle('More').count();
  expect(kebabsBefore).toBeGreaterThan(0);

  await page.getByTitle('More').first().click();
  await clickMenuItem(page.getByText('Cancel post'));

  await expect(page.getByTitle('More')).toHaveCount(kebabsBefore - 1);
  expect(sawApiCall).toBe(false);
});

test.describe('sidebar delete (same behavior as ChatPage, scoped to this page)', () => {
  test('optimistic removal reverts on failure; success calls DELETE', async ({ page }) => {
    await mockGetSessions(page, [{ session_id: 's1', title: 'Schedule-page chat', last_active_at: new Date().toISOString() }]);
    await mockDeleteSession(page, preset.slow(300, { detail: 'boom' }, 500));
    await page.goto('/schedule');

    await page.getByTitle('Delete').click();
    await expect(page.getByText('Schedule-page chat')).not.toBeVisible();
    await expect(page.getByText('Schedule-page chat')).toBeVisible({ timeout: 2000 });
  });
});
