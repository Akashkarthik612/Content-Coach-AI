import { test, expect } from './fixtures/authFixtures';
import { mockGetSessions, mockSessionThreads, mockDeleteSession, preset, makeCallLog } from './fixtures/mockRouter';
import { startSseServer, routeStreamTo } from './fixtures/sseHelper';

/**
 * ChatPage.jsx — composer, SSE streaming, sidebar/session persistence.
 * Angle-review and workspace/draft-approval flows live in their own spec
 * files (chat-angles.spec.ts, chat-workspace.spec.ts) since they're each
 * substantial on their own.
 */

test('empty state renders with no sessions', async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/chat');

  await expect(page.getByText('What should we work on?')).toBeVisible();
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible();
});

test('sending a message streams tokens progressively to a direct answer', async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/chat');

  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('What should I post about today?');
  await page.getByTitle('Send').click();

  const { body } = await sse.firstRequest;
  expect(body).toMatchObject({ prompt: 'What should I post about today?' });
  expect(body.session_id).toBeTruthy();

  sse.sendToken('Here are ');
  sse.sendToken('three ideas.');
  sse.sendDone({ status: 'complete' });
  sse.end();

  await expect(page.getByText('Here are three ideas.')).toBeVisible();
  await sse.close();
});

test('ActivityTimeline renders only backend-sent activity labels verbatim, never a fabricated one', async ({ supabaseAuthPage: page }) => {
  await mockGetSessions(page, []);
  await page.goto('/chat');

  const sse = await startSseServer();
  await routeStreamTo(page, sse);

  await page.getByPlaceholder('Drop a thought, or ask to research and write…').fill('Research my recent posts');
  await page.getByTitle('Send').click();
  await sse.firstRequest;

  sse.sendActivity({ id: 'a1', title: 'Searching your vault', status: 'running' });
  await expect(page.getByText('Searching your vault')).toBeVisible();
  sse.sendActivity({ id: 'a1', title: 'Searching your vault', status: 'completed' });
  sse.sendToken('Done.');
  sse.sendDone({ status: 'complete' });
  sse.end();

  // The timeline auto-collapses once phase === 'done' (see ChatPage.jsx's
  // MessageBubble: expanded defaults to !phaseDone) — reopen it via its
  // header toggle to confirm the same backend-sent label survived, verbatim.
  await expect(page.getByText('Done · 1 step')).toBeVisible();
  await page.getByText('Done · 1 step').click();
  await expect(page.getByText('Searching your vault')).toBeVisible();
  // Only the one activity title the backend sent should ever appear — no
  // hardcoded node/tool/agent name anywhere in the timeline (see CLAUDE.md's
  // ActivityTimeline row: "never a raw node/tool/agent name").
  await expect(page.getByText(/supervisor_node|tool_node|researcher_node/i)).toHaveCount(0);
  await sse.close();
});

test.describe('sidebar session restore', () => {
  test('KNOWN GAP: restore is a no-op even when the session is present in the fetched list', async ({ supabaseAuthPage: page }) => {
    // ChatPage.jsx has two effects on mount:
    //   1. getSessions().then(...) reads localStorage('lastSessionId') to
    //      decide whether to restore — but only inside its .then(), a
    //      microtask that runs AFTER all synchronous effect bodies.
    //   2. useEffect(() => localStorage.setItem('lastSessionId',
    //      currentSessionId), [currentSessionId]) — currentSessionId starts
    //      as a fresh crypto.randomUUID(), and this effect fires
    //      synchronously on the very same mount, overwriting whatever
    //      'lastSessionId' held (e.g. a real prior session) with that
    //      random UUID *before* effect 1's microtask ever reads it back.
    // The result: effect 1 always reads its own freshly-written random
    // UUID, which never matches anything in the fetched list, so idx is
    // always -1 and restoration silently never fires — on every load, not
    // just intermittently. This test pins that; it is not the documented
    // intended behavior (see claude_ui.md's ChatPage "Persisted chat
    // history" section).
    const sessions = [
      { session_id: 's1', title: 'First chat', last_active_at: new Date().toISOString() },
      { session_id: 's2', title: 'Second chat', last_active_at: new Date().toISOString() },
    ];
    const log = makeCallLog();
    await mockGetSessions(page, sessions);
    await mockSessionThreads(page, { threads: [] }, log);
    await page.evaluate(() => localStorage.setItem('lastSessionId', 's2'));
    await page.goto('/chat');

    await expect(page.getByText('Second chat')).toBeVisible(); // the row exists in the sidebar…
    await page.waitForTimeout(500);
    expect(log.count('GET', '/sessions/s2/threads')).toBe(0); // …but it was never actually restored
  });

  test('does not restore and does not crash when the last session was deleted server-side', async ({ supabaseAuthPage: page }) => {
    const sessions = [{ session_id: 's1', title: 'First chat', last_active_at: new Date().toISOString() }];
    const log = makeCallLog();
    await mockGetSessions(page, sessions);
    await mockSessionThreads(page, { threads: [] }, log);
    await page.evaluate(() => localStorage.setItem('lastSessionId', 'gone-session'));
    await page.goto('/chat');

    await expect(page.getByText('What should we work on?')).toBeVisible();
    expect(log.count('GET', '/threads')).toBe(0);
  });
});

test('selectChat() rehydrates the full prior message list via getSessionThreads()', async ({ supabaseAuthPage: page }) => {
  const sessions = [{ session_id: 's1', title: 'Prior chat', last_active_at: new Date().toISOString() }];
  await mockGetSessions(page, sessions);
  await mockSessionThreads(page, {
    session_id: 's1',
    threads: [
      { thread_id: 't1', user_prompt: 'What did I write about onboarding?', status: 'complete', answer: 'You covered activation and day-1 retention.' },
    ],
  });
  await page.goto('/chat');

  await page.getByText('Prior chat').click();

  await expect(page.getByText('What did I write about onboarding?')).toBeVisible();
  await expect(page.getByText('You covered activation and day-1 retention.')).toBeVisible();
});

test.describe('delete chat row', () => {
  test('optimistic removal reverts on a failing deleteSession()', async ({ supabaseAuthPage: page }) => {
    const sessions = [{ session_id: 's1', title: 'Doomed chat', last_active_at: new Date().toISOString() }];
    await mockGetSessions(page, sessions);
    // Slowed deliberately so the optimistic-removal window is observable
    // before the revert lands — an instant failure would race the assertion.
    await mockDeleteSession(page, preset.slow(300, { detail: 'boom' }, 500));
    await page.goto('/chat');

    await page.getByTitle('Delete').click();
    await expect(page.getByText('Doomed chat')).not.toBeVisible();
    await expect(page.getByText('Doomed chat')).toBeVisible({ timeout: 2000 }); // reverted after the failed call resolves
  });

  test('success calls DELETE /api/ai/sessions/{id} and leaves the row removed', async ({ supabaseAuthPage: page }) => {
    const sessions = [{ session_id: 's1', title: 'Removable chat', last_active_at: new Date().toISOString() }];
    const log = makeCallLog();
    await mockGetSessions(page, sessions);
    await mockDeleteSession(page, preset.noContent(), log);
    await page.goto('/chat');

    await page.getByTitle('Delete').click();
    await expect(page.getByText('Removable chat')).not.toBeVisible();
    expect(log.find('DELETE', '/api/ai/sessions/s1')).toBeTruthy();
  });
});

test.describe('Composer keyboard behavior', () => {
  test('Enter sends the message', async ({ supabaseAuthPage: page }) => {
    await mockGetSessions(page, []);
    await page.goto('/chat');
    const sse = await startSseServer();
    await routeStreamTo(page, sse);

    const box = page.getByPlaceholder('Drop a thought, or ask to research and write…');
    await box.fill('Hello there');
    await box.press('Enter');

    await sse.firstRequest;
    await expect(page.getByText('Hello there', { exact: true })).toBeVisible();
    sse.sendDone({ status: 'complete', answer: 'Hi!' });
    sse.end();
    await sse.close();
  });

  test('Shift+Enter inserts a newline without sending', async ({ supabaseAuthPage: page }) => {
    await mockGetSessions(page, []);
    await page.goto('/chat');

    const box = page.getByPlaceholder('Drop a thought, or ask to research and write…');
    await box.fill('line one');
    await box.press('Shift+Enter');
    await box.type('line two');

    await expect(box).toHaveValue('line one\nline two');
    // Nothing sent — still on the empty state.
    await expect(page.getByText('What should we work on?')).toBeVisible();
  });
});
