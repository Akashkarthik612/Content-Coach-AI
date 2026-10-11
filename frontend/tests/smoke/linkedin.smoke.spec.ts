import { test, expect, type Page } from '@playwright/test';
import { FAKE, signIn } from './helpers';

/**
 * LinkedIn studio against the real backend (see playwright.smoke.config.ts).
 * Every reply comes from the backend: real thread storage, real checkpointer,
 * real Gemini client — answered by the fake Gemini, which numbers its posts
 * ("fake post 1", "fake post 2", ...) from its last reset.
 */
async function send(page: Page, message: string) {
  await page.getByTestId('li-input').fill(message);
  await page.getByTestId('li-send').click();
}

const editor = (page: Page) => page.getByTestId('li-post-editor');
const history = (page: Page) => page.getByTestId('li-history-item');

test.beforeEach(async ({ page, request }) => {
  await request.post(`${FAKE}/__control/reset`);
  await signIn(page, request);
  await page.goto('/linkedin');
});

test('a message reaches the agent and the draft lands in the editor', async ({ page }) => {
  await send(page, 'write about our launch');

  await expect(editor(page)).toHaveValue('fake post 1');
  await expect(history(page)).toHaveCount(1);
  await expect(history(page).first()).toContainText('write about our launch');
});

test('a follow-up goes to the same thread with the whole conversation', async ({ page, request }) => {
  await send(page, 'write about our launch');
  await expect(editor(page)).toHaveValue('fake post 1');

  await send(page, 'make it shorter');
  await expect(editor(page)).toHaveValue('fake post 2');

  const calls = await (await request.get(`${FAKE}/__control/requests`)).json();
  const roles = calls[1].body.contents.map((c: { role: string }) => c.role);
  expect(roles).toEqual(['user', 'model', 'user']);
  await expect(history(page)).toHaveCount(1);
});

test('chats survive a reload and reopen from the backend', async ({ page }) => {
  await send(page, 'write about our launch');
  await expect(editor(page)).toHaveValue('fake post 1');
  await send(page, 'make it shorter');
  await expect(editor(page)).toHaveValue('fake post 2');

  await page.reload();
  await expect(history(page)).toHaveCount(1);
  await history(page).first().click();

  await expect(editor(page)).toHaveValue('fake post 2');
  await expect(page.getByText('make it shorter')).toBeVisible();
});

test('the turn limit ends the chat and asks for a new one', async ({ page }) => {
  // serve.py runs with THREAD_TURN_LIMIT=3.
  for (const [i, message] of ['one', 'two', 'three'].entries()) {
    await send(page, message);
    await expect(editor(page)).toHaveValue(`fake post ${i + 1}`);
  }

  await expect(page.getByTestId('li-limit-notice')).toBeVisible();
  await expect(page.getByTestId('li-input')).toBeDisabled();
});

test('a failed generation shows the error and keeps the message', async ({ page, request }) => {
  await request.post(`${FAKE}/__control/error/400`);

  await send(page, 'this will fail');

  await expect(page.getByTestId('li-error')).toContainText('could not generate a post');
  await expect(page.getByTestId('li-input')).toHaveValue('this will fail');
  await expect(history(page)).toHaveCount(0);

  await page.getByTestId('li-send').click(); // resend works
  await expect(editor(page)).toHaveValue('fake post 2');
});

test('deleting a chat removes it from the backend', async ({ page }) => {
  await send(page, 'delete me');
  await expect(editor(page)).toHaveValue('fake post 1');

  await page.getByTestId('li-delete').click();
  await expect(history(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('li-input')).toBeVisible();
  await expect(history(page)).toHaveCount(0);
});
