import type { Page, Route } from '@playwright/test';

/**
 * Composable page.route() mocking for every backend call the frontend makes.
 * Response shapes mirror CLAUDE.md's "API Endpoints" section exactly — if the
 * backend contract changes, update the shapes here, not the assertions in
 * individual spec files.
 *
 * Nothing in this file ever lets a real request reach a network — every
 * mocked route ends in route.fulfill() (or, for `hang`, a promise that never
 * resolves so the request stays pending forever). See sseHelper.ts for the
 * one exception (SSE streaming), which needs a real local server instead of
 * a canned body.
 */

// ── Call log ────────────────────────────────────────────────────────────────
export interface LoggedCall {
  method: string;
  url: string;
  postData: unknown;
  headers: Record<string, string>;
}

export class CallLog {
  calls: LoggedCall[] = [];

  record(route: Route) {
    const req = route.request();
    let postData: unknown = null;
    try { postData = req.postDataJSON(); } catch { postData = req.postData(); }
    this.calls.push({ method: req.method(), url: req.url(), postData, headers: req.headers() });
  }

  /** Count calls whose method + URL (substring match) both match. */
  count(method: string, urlSubstring: string): number {
    return this.calls.filter(c => c.method === method && c.url.includes(urlSubstring)).length;
  }

  find(method: string, urlSubstring: string): LoggedCall | undefined {
    return this.calls.find(c => c.method === method && c.url.includes(urlSubstring));
  }

  clear() { this.calls = []; }
}

export function makeCallLog(): CallLog {
  return new CallLog();
}

// ── Response presets ────────────────────────────────────────────────────────
export type JsonBody = Record<string, unknown> | unknown[] | string | null;

type Handler = (route: Route) => Promise<void> | void;

async function fulfillJson(route: Route, status: number, body: JsonBody, extraHeaders: Record<string, string> = {}) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: extraHeaders,
    body: body === null ? '' : JSON.stringify(body),
  });
}

export const preset = {
  success(body: JsonBody, status = 200): Handler {
    return (route) => fulfillJson(route, status, body);
  },
  error(status: number, body: JsonBody = { detail: 'Mocked error' }): Handler {
    return (route) => fulfillJson(route, status, body);
  },
  slow(ms: number, body: JsonBody, status = 200): Handler {
    return async (route) => {
      await new Promise((r) => setTimeout(r, ms));
      await fulfillJson(route, status, body);
    };
  },
  /** Route never resolves — request stays pending until the page navigates away. */
  hang(): Handler {
    return () => new Promise(() => { /* never resolves */ });
  },
  /** Valid HTTP 200 but a body that isn't parseable JSON. */
  malformed(): Handler {
    return (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"broken": tru' });
  },
  /** 204 No Content, e.g. DELETE endpoints. */
  noContent(): Handler {
    return (route) => route.fulfill({ status: 204, body: '' });
  },
};

/**
 * Registers a route that only responds to one HTTP method; any other method
 * on the same URL pattern falls through (call this multiple times per URL
 * with different methods for a full CRUD mock).
 */
export async function mockEndpoint(
  page: Page,
  urlPattern: string | RegExp,
  method: string,
  handler: Handler,
  log?: CallLog,
) {
  await page.route(urlPattern, async (route) => {
    if (route.request().method() !== method) {
      return route.fallback();
    }
    log?.record(route);
    await handler(route);
  });
}

/** Handler that returns a different response each call (array = sequence, last one repeats). */
export function sequence(handlers: Handler[]): Handler {
  let i = 0;
  return (route) => {
    const h = handlers[Math.min(i, handlers.length - 1)];
    i++;
    return h(route);
  };
}

// ── AI (/api/ai/*) ──────────────────────────────────────────────────────────
export interface MockSession {
  session_id: string;
  title: string;
  last_active_at: string;
}

export async function mockGetSessions(page: Page, sessions: MockSession[] | Handler, log?: CallLog) {
  const handler = typeof sessions === 'function' ? sessions : preset.success({ sessions });
  await mockEndpoint(page, '**/api/ai/sessions', 'GET', handler, log);
}

export async function mockDeleteSession(page: Page, handler: Handler = preset.noContent(), log?: CallLog) {
  await mockEndpoint(page, /\/api\/ai\/sessions\/[^/]+$/, 'DELETE', handler, log);
}

export async function mockSessionThreads(page: Page, handler: Handler | Record<string, unknown>, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, /\/api\/ai\/sessions\/[^/]+\/threads$/, 'GET', h, log);
}

export async function mockResumeAI(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, '**/api/ai/resume', 'POST', handler, log);
}

export async function mockQueryAI(page: Page, handler: Handler | Record<string, unknown>, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, '**/api/ai/query', 'POST', h, log);
}

export async function mockRefineAI(page: Page, handler: Handler | Record<string, unknown>, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, '**/api/ai/refine', 'POST', h, log);
}

export async function mockDraftFromTopic(page: Page, handler: Handler | Record<string, unknown>, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, '**/api/ai/draft-from-topic', 'POST', h, log);
}

// ── Profile (/api/profile/*) ────────────────────────────────────────────────
export async function mockGetProfile(page: Page, profile: Record<string, unknown> | null | Handler, log?: CallLog) {
  const handler = typeof profile === 'function'
    ? profile
    : profile === null
      ? preset.error(404, { detail: 'Not found' })
      : preset.success(profile as JsonBody);
  await mockEndpoint(page, '**/api/profile', 'GET', handler, log);
}

export async function mockSubmitOnboarding(page: Page, handler: Handler = preset.success({ ok: true }), log?: CallLog) {
  await mockEndpoint(page, '**/api/profile/onboarding', 'POST', handler, log);
}

export async function mockAccountSettings(page: Page, handler: Handler | { email: string; username: string }, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, '**/api/profile/settings', 'GET', h, log);
}

// ── LinkedIn (/api/linkedin/*) ──────────────────────────────────────────────
export async function mockLinkedInStatus(page: Page, handler: Handler | { connected: boolean; display_name?: string; profile_image_url?: string; expires_at?: string }, log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, '**/api/linkedin/connection-status', 'GET', h, log);
}

export async function mockLinkedInAuthUrl(page: Page, handler: Handler = preset.success({ auth_url: 'https://www.linkedin.com/oauth/mock' }), log?: CallLog) {
  await mockEndpoint(page, '**/api/linkedin/auth/url', 'GET', handler, log);
}

export async function mockPublishToLinkedIn(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, /\/api\/linkedin\/publish\/[^/]+$/, 'POST', handler, log);
}

// ── Vault (/api/vault/*) ─────────────────────────────────────────────────────
export async function mockVaultFolders(page: Page, folders: unknown[] | Handler, log?: CallLog) {
  const handler = typeof folders === 'function' ? folders : preset.success(folders as JsonBody);
  await mockEndpoint(page, '**/api/vault/folders', 'GET', handler, log);
}

export async function mockCreateFolder(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, '**/api/vault/folders', 'POST', handler, log);
}

export async function mockPostsInFolder(page: Page, postsByFolder: Record<string, unknown[]>, log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/folders\/[^/]+\/posts$/, 'GET', async (route) => {
    const m = route.request().url().match(/\/folders\/([^/]+)\/posts/);
    const folderId = m?.[1] ?? '';
    await fulfillJson(route, 200, postsByFolder[folderId] ?? []);
  }, log);
}

export async function mockCreatePostInFolder(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/folders\/[^/]+\/posts$/, 'POST', handler, log);
}

export async function mockGetPost(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/posts\/[^/]+$/, 'GET', handler, log);
}

export async function mockRenamePost(page: Page, handler: Handler = preset.success({ ok: true }), log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/posts\/[^/]+$/, 'PATCH', handler, log);
}

export async function mockDeletePost(page: Page, handler: Handler = preset.success({ ok: true }), log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/posts\/[^/]+$/, 'DELETE', handler, log);
}

export async function mockSaveVersion(page: Page, handler: Handler = preset.success({ id: 'v1', version_number: 1 }), log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/posts\/[^/]+\/versions$/, 'POST', handler, log);
}

export async function mockGetVersions(page: Page, handler: Handler | unknown[], log?: CallLog) {
  const h = typeof handler === 'function' ? handler : preset.success(handler as JsonBody);
  await mockEndpoint(page, /\/api\/vault\/posts\/[^/]+\/versions$/, 'GET', h, log);
}

export async function mockGetVersion(page: Page, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, /\/api\/vault\/versions\/[^/]+$/, 'GET', handler, log);
}

// ── Generic escape hatch ─────────────────────────────────────────────────────
/** For anything not covered above — pass the exact glob/regex + method + handler. */
export async function mockRaw(page: Page, urlPattern: string | RegExp, method: string, handler: Handler, log?: CallLog) {
  await mockEndpoint(page, urlPattern, method, handler, log);
}

/**
 * Fails the test loudly if any request hits a URL matching `pattern` that
 * wasn't otherwise mocked — used by agents-page.spec.ts to prove a page makes
 * zero API calls, and generally as a guard against accidentally hitting a
 * real backend.
 */
export async function failOnUnmocked(page: Page, pattern: string | RegExp = '**/api/**') {
  await page.route(pattern, (route) => {
    throw new Error(`Unmocked request reached the network: ${route.request().method()} ${route.request().url()}`);
  });
}
