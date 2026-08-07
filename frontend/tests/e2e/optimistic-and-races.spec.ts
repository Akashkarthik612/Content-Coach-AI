import { expect } from '@playwright/test';
import { test, mockSupabaseAuthSurface, TEST_USER } from './fixtures/authFixtures';
import {
  mockVaultFolders, mockPostsInFolder, mockGetVersions, mockSaveVersion, mockRenamePost,
  mockGetSessions, mockGetProfile, mockLinkedInStatus, mockRefineAI, mockAccountSettings, mockRaw,
  preset, makeCallLog,
} from './fixtures/mockRouter';
import { startSseServer, routeStreamTo } from './fixtures/sseHelper';

/** Two-tab conflicts, and an audit of other single-click-should-mean-single-request buttons. */

const NOW = new Date().toISOString();
const FOLDER_1 = { id: 'f1', user_id: 'u1', name: 'General', description: '', created_at: NOW };
const POST_1 = { id: 'p1', folder_id: 'f1', title: 'Shared draft', status: 'draft', is_pinned: false, current_version: 1, created_at: NOW, updated_at: NOW };

test('two tabs editing the same post: last write wins silently — no conflict UI exists (documented behavior, not an ideal)', async ({ browser }) => {
  const saveLog = makeCallLog();

  async function setUpTab() {
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockSupabaseAuthSurface(page);
    await mockVaultFolders(page, [FOLDER_1]);
    await mockPostsInFolder(page, { f1: [POST_1] });
    await mockGetVersions(page, []);
    await mockRenamePost(page, preset.success({ ...POST_1 }));
    await mockSaveVersion(page, preset.success({ id: 'v-shared', version_number: 1 }), saveLog);

    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(TEST_USER.email);
    await page.getByPlaceholder('••••••••').fill(TEST_USER.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/chat$/);

    await page.goto('/my-work');
    await page.getByText('Shared draft').click();
    return { context, page };
  }

  const tabA = await setUpTab();
  const tabB = await setUpTab();

  await tabA.page.getByPlaceholder('Start writing…').fill('Edit made from Tab A.');
  await tabB.page.getByPlaceholder('Start writing…').fill('Edit made from Tab B — overwrites A.');

  await tabA.page.waitForTimeout(900);
  await tabB.page.waitForTimeout(900);

  // Both tabs saved independently — the backend contract has no version
  // token / conflict check (per CLAUDE.md, no such field exists on
  // post_versions), so neither tab is told about the other. This test pins
  // that: both calls succeed, neither surfaces a conflict warning.
  expect(saveLog.calls.length).toBe(2);
  await expect(tabA.page.getByText(/conflict|overwritten|out of date/i)).toHaveCount(0);
  await expect(tabB.page.getByText(/conflict|overwritten|out of date/i)).toHaveCount(0);

  await tabA.context.close();
  await tabB.context.close();
});

test.describe('other single-click-should-mean-single-request buttons', () => {
  test('WorkspaceView Refine submit — rapid double-click behavior is pinned as-observed', async ({ supabaseAuthPage: page }) => {
    await mockGetSessions(page, []);
    await mockGetProfile(page, null);
    await mockLinkedInStatus(page, { connected: false });
    await page.goto('/chat');

    const sse = await startSseServer();
    await routeStreamTo(page, sse);
    await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Write a post');
    await page.getByTitle('Send').click();
    await sse.firstRequest;
    sse.sendToken('Draft text.');
    sse.sendDone({ status: 'awaiting_approval', thread_id: 't1', post_id: 'post-1' });
    sse.end();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();

    const log = makeCallLog();
    await mockRefineAI(page, async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ refined_draft: 'Refined.' }) });
    }, log);

    // submitWsCmd() clears ws.cmdInput synchronously on the first call,
    // which drives the send button's `disabled` state — so unlike
    // WorkspaceView's Approve button (no guard at all, see
    // chat-workspace.spec.ts), this one is expected to naturally collapse
    // a double-click into one call once the input is empty. Using a real
    // dblclick (not two sequential .click()s, which each wait for the
    // button to be actionable and would hang forever on the second one
    // once disabled) fires both pointer events before React can re-render.
    await page.getByPlaceholder('Refine the draft…').fill('Make it punchier');
    const sendBtn = page.locator('button[title="Send"]').last();
    await sendBtn.dblclick();

    await expect(page.getByText('Refined.')).toBeVisible();
    expect(log.calls.length).toBe(1);
    await sse.close();
  });

  test('Settings email Save button IS correctly guarded — only one updateEmail() call on rapid double-click', async ({ supabaseAuthPage: page }) => {
    await mockGetSessions(page, []);
    await mockAccountSettings(page, { email: 'ada@example.com', username: 'ada' });
    const log = makeCallLog();
    await mockRaw(page, '**/auth/v1/user**', 'PUT', async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { email: 'new@example.com' } }) });
    }, log);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Change' }).first().click();
    await page.getByPlaceholder('you@example.com').fill('new@example.com');
    await page.getByRole('button', { name: 'Save' }).dblclick();

    await expect(page.getByText('Confirmation link sent — check your new inbox to finish the change')).toBeVisible();
    expect(log.calls.length).toBe(1); // emailSaving disables the button mid-flight
  });
});
