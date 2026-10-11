import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { FAKE, signIn } from './helpers';

/**
 * Knowledge page against the real backend (see playwright.smoke.config.ts):
 * the browser goes through the real Drive connect flow (backend -> fake
 * Google consent -> /connect/gdrive/callback -> backend), the real folder
 * picker, and the real background sync — chunking, embedding and storage all
 * run in the backend. Only Google and Gemini are fakes (tests/smoke/fake_google.py).
 */

function section(heading: string, topic: string, n = 20): string {
  const sentences = Array.from({ length: n }, (_, i) =>
    `${topic} note ${i}: we tried approach ${i} with early users and recorded what changed.`).join(' ');
  return `## ${heading}\n\n${sentences}\n\n`;
}

const LAUNCH = '# Launch plan\n\n' + ['Pricing', 'Channels', 'Timeline', 'Risks'].map(h => section(h, h)).join('');
const INTERVIEWS = '# Customer interviews\n\n' + section('Founders', 'Founders') + section('Agencies', 'Agencies');

async function seedDrive(request: APIRequestContext) {
  const post = async (path: string, data: object) => (await (await request.post(`${FAKE}/__control/drive/${path}`, { data })).json()).id as string;
  const folder = await post('folder', { name: 'Honne notes' });
  await post('folder', { name: 'Old stuff' });
  return {
    folder,
    launch: await post('doc', { name: 'Launch plan', markdown: LAUNCH, parent: folder }),
    interviews: await post('doc', { name: 'Customer interviews', markdown: INTERVIEWS, parent: folder }),
  };
}

const doc = (page: Page, title: string) => page.getByTestId('kn-doc').filter({ hasText: title });

/** Connect Drive from the knowledge page and sync the "Honne notes" folder. */
async function connectAndSync(page: Page) {
  await page.goto('/knowledge');
  await expect(page.getByTestId('kn-docs-total')).toHaveText('0');
  await page.getByTestId('kn-connect').click();
  await page.getByTestId('kn-connector-gdrive').click();
  await page.getByTestId('kn-google').click();

  // Google's consent (fake) -> callback page -> back on /knowledge with the picker open.
  await expect(page.getByTestId('kn-notice')).toContainText('Google Drive connected', { timeout: 20_000 }); // OAuth round trip
  const picker = page.getByTestId('kn-picker');
  await expect(picker).toBeVisible();
  await expect(picker.getByTestId('kn-picker-item')).toHaveCount(2);
  await picker.getByRole('checkbox', { name: 'Sync Honne notes' }).check();
  await picker.getByTestId('kn-picker-save').click();
  await expect(picker).toBeHidden();

  await expect(page.getByTestId('kn-doc')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('kn-source-status')).toHaveText('Active', { timeout: 30_000 });
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${FAKE}/__control/reset`);
  await signIn(page, request);
});

test('connect Drive, pick a folder, and its documents are chunked and stored', async ({ page, request }) => {
  await seedDrive(request);
  await connectAndSync(page);

  await expect(doc(page, 'Launch plan').getByTestId('kn-doc-chunks')).toHaveText('4');
  await expect(doc(page, 'Customer interviews').getByTestId('kn-doc-chunks')).toHaveText('2');
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('6');
  await expect(page.getByTestId('kn-source')).toContainText('e2e@drive.test');
  await expect(page.getByTestId('kn-source')).toContainText('1 selected');

  // Survives a reload: everything shown comes from the backend.
  await page.reload();
  await expect(page.getByTestId('kn-doc')).toHaveCount(2);
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('6');
});

test('an edit in Drive shows up after "Sync now"', async ({ page, request }) => {
  const ids = await seedDrive(request);
  await connectAndSync(page);
  await expect(doc(page, 'Customer interviews').getByTestId('kn-doc-chunks')).toHaveText('2');

  await request.post(`${FAKE}/__control/drive/edit/${ids.interviews}`, {
    data: { markdown: INTERVIEWS + section('Creators', 'Creators') },
  });
  await page.getByTestId('kn-sync').click();

  await expect(doc(page, 'Customer interviews').getByTestId('kn-doc-chunks')).toHaveText('3', { timeout: 30_000 });
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('7');
});

test('disconnecting a source removes its documents after confirmation', async ({ page, request }) => {
  await seedDrive(request);
  await connectAndSync(page);

  await page.getByTestId('kn-disconnect').click();
  await page.getByTestId('kn-disconnect-confirm').click();

  await expect(page.getByTestId('kn-notice')).toContainText('disconnected');
  await expect(page.getByTestId('kn-source')).toHaveCount(0);
  await expect(page.getByTestId('kn-docs-total')).toHaveText('0');
});

test('revoked Google access asks to reconnect, and reconnecting resumes syncing', async ({ page, request }) => {
  const ids = await seedDrive(request);
  await connectAndSync(page);

  // The user removes Honne in their Google account; the next sync finds out.
  await request.post(`${FAKE}/__control/drive/revoke`);
  await page.getByTestId('kn-sync').click();
  const expired = page.getByTestId('kn-expired');
  await expect(expired).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('kn-source-status')).toHaveText('Reconnect needed');
  await expect(page.getByTestId('kn-docs-total')).toHaveText('2'); // stored documents are kept
  await expect(page.getByTestId('kn-sync')).toBeDisabled();

  // Edited in Drive while access was gone: nothing can sync it yet.
  await request.post(`${FAKE}/__control/drive/edit/${ids.interviews}`, {
    data: { markdown: INTERVIEWS + section('Creators', 'Creators') },
  });

  await expired.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByText('Reconnect Google Drive')).toBeVisible();
  await page.getByTestId('kn-google').click();

  // Back on the page: same source, new tokens, and syncing restarts by itself (no "Sync now").
  await expect(page.getByTestId('kn-notice')).toContainText('reconnected', { timeout: 20_000 });
  await expect(page.getByTestId('kn-picker')).toHaveCount(0);
  await expect(expired).toBeHidden();
  await expect(page.getByTestId('kn-source')).toHaveCount(1);
  await expect(doc(page, 'Customer interviews').getByTestId('kn-doc-chunks')).toHaveText('3', { timeout: 30_000 });
  await expect(page.getByTestId('kn-source-status')).toHaveText('Active');
});

test('a document added to the folder appears, and one deleted in Drive disappears with its chunks', async ({ page, request }) => {
  const ids = await seedDrive(request);
  await connectAndSync(page);
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('6');

  // Add a new document to the selected folder, then sync.
  await request.post(`${FAKE}/__control/drive/doc`, {
    data: { name: 'Pricing notes', markdown: `# Pricing notes\n\n${section('Tiers', 'Tiers')}`, parent: ids.folder },
  });
  await page.getByTestId('kn-sync').click();
  await expect(page.getByTestId('kn-doc')).toHaveCount(3, { timeout: 30_000 });
  await expect(doc(page, 'Pricing notes').getByTestId('kn-doc-chunks')).toHaveText('1');
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('7');

  // Delete one in Drive (move to trash), then sync: the document and its chunks are gone.
  await request.post(`${FAKE}/__control/drive/trash/${ids.launch}`);
  await page.getByTestId('kn-sync').click();
  await expect(doc(page, 'Launch plan')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('kn-doc')).toHaveCount(2);
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('3');
  await expect(page.getByTestId('kn-docs-total')).toHaveText('2');
});

test('a document deleted in Honne loses its chunks and is not synced back', async ({ page, request }) => {
  const ids = await seedDrive(request);
  await connectAndSync(page);

  await doc(page, 'Launch plan').getByTestId('kn-doc-menu').click();
  await doc(page, 'Launch plan').getByTestId('kn-doc-delete').click();
  await doc(page, 'Launch plan').getByTestId('kn-doc-delete-confirm').click();
  await expect(page.getByTestId('kn-notice')).toContainText('Launch plan deleted');
  await expect(page.getByTestId('kn-doc')).toHaveCount(1);
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('2');

  // Both files change in Drive. Once the sync has picked up the other one,
  // the deleted one must still be gone.
  await request.post(`${FAKE}/__control/drive/edit/${ids.launch}`, { data: { markdown: LAUNCH + section('Hiring', 'Hiring') } });
  await request.post(`${FAKE}/__control/drive/edit/${ids.interviews}`, {
    data: { markdown: INTERVIEWS + section('Creators', 'Creators') },
  });
  await page.getByTestId('kn-sync').click();
  await expect(doc(page, 'Customer interviews').getByTestId('kn-doc-chunks')).toHaveText('3', { timeout: 30_000 });
  await expect(doc(page, 'Launch plan')).toHaveCount(0);
  await expect(page.getByTestId('kn-chunks-total')).toHaveText('3');
});

test('a cancelled Google consent is explained', async ({ page }) => {
  await page.goto('/knowledge?drive=error&reason=consent_denied');
  await expect(page.getByTestId('kn-notice')).toContainText('consent screen was cancelled');
  await expect(page).toHaveURL(/\/knowledge$/);
});
