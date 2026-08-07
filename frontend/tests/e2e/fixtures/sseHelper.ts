import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';

/**
 * Playwright's route.fulfill() sends one static body — it cannot deliver a
 * real, time-spaced stream. To genuinely exercise ai.js's streamQuery()
 * (which reads response.body.getReader() chunk-by-chunk), this spins up a
 * real local http server and redirects the browser's fetch('/api/ai/stream')
 * to it via route.continue({ url }) — the browser then talks to a real
 * server and receives a real stream, so hangs / mid-chunk closes / slow
 * delivery all behave exactly as they would against the real backend.
 *
 * CORS: route.continue({ url }) points the browser at a different origin
 * than the page it loaded from, so the browser applies normal CORS rules
 * (including a preflight OPTIONS for the POST + application/json body) —
 * this server answers both.
 */
export interface SseServer {
  /** Point page.route()'s redirect target at this. */
  url: string;
  /** Emits `data: {"type":"token","content":...}\n\n` */
  sendToken(text: string): void;
  /** Emits a backend `activity` event — shape matches CLAUDE.md's onActivity payload. */
  sendActivity(evt: { id: string; parentId?: string | null; title: string; description?: string; status: 'running' | 'completed' | 'failed' }): void;
  /** Emits the terminal `done` event. */
  sendDone(payload: Record<string, unknown>): void;
  /** Emits an `error` event (still a 200 SSE stream — errors are in-band). */
  sendError(message: string): void;
  /** Writes a raw, possibly-invalid chunk verbatim (for malformed/truncated-JSON tests). */
  sendRaw(chunk: string): void;
  /** Destroys the socket mid-response — simulates the server dying abruptly, no clean close. */
  closeAbruptly(): void;
  /** Ends the HTTP response normally (as if the backend finished without ever sending `done`). */
  end(): void;
  /** Shuts the local server down. Always call in test teardown. */
  close(): Promise<void>;
  /** Resolves with the parsed JSON body + headers of the first request received — lets tests assert streamQuery()'s actual payload/headers without fighting route.continue()'s URL rewriting. */
  firstRequest: Promise<{ body: Record<string, unknown>; headers: http.IncomingHttpHeaders }>;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, Authorization',
  };
}

export async function startSseServer(): Promise<SseServer> {
  let currentRes: http.ServerResponse | null = null;
  let resolveFirstRequest: (v: { body: Record<string, unknown>; headers: http.IncomingHttpHeaders }) => void;
  const firstRequest = new Promise<{ body: Record<string, unknown>; headers: http.IncomingHttpHeaders }>((resolve) => { resolveFirstRequest = resolve; });
  let sawFirstRequest = false;

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!sawFirstRequest) {
        sawFirstRequest = true;
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* non-JSON body */ }
        resolveFirstRequest({ body, headers: req.headers });
      }
    });

    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    currentRes = res;
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/api/ai/stream`;

  const write = (chunk: string) => { currentRes?.write(chunk); };
  const sseEvent = (obj: Record<string, unknown>) => write(`data: ${JSON.stringify(obj)}\n\n`);

  return {
    url,
    firstRequest,
    sendToken: (text) => sseEvent({ type: 'token', content: text }),
    sendActivity: (evt) => sseEvent({ type: 'activity', ...evt }),
    sendDone: (payload) => sseEvent({ type: 'done', ...payload }),
    sendError: (message) => sseEvent({ type: 'error', message }),
    sendRaw: (chunk) => write(chunk),
    closeAbruptly: () => { currentRes?.destroy(); },
    end: () => { currentRes?.end(); },
    close: () => new Promise<void>((resolve) => {
      // http.Server#close() only fires its callback once every open
      // connection has ended — a deliberately-hung response (the "hang"
      // preset never calls res.end()) would otherwise leave this pending
      // forever. closeAllConnections() forces any still-open sockets shut
      // so teardown always completes.
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

/** Wires page.route so any /api/ai/stream request is redirected to a real local SSE server. */
export async function routeStreamTo(page: Page, sse: SseServer) {
  await page.route('**/api/ai/stream', (route) => route.continue({ url: sse.url }));
}

/**
 * Convenience: start a server, wire it to the page, drive a normal
 * token-by-token stream ending in `done`, then close. Returns once the
 * server has sent everything (does not wait for the client to consume it).
 */
export async function playNormalStream(
  page: Page,
  opts: { tokens?: string[]; activities?: Parameters<SseServer['sendActivity']>[0][]; done: Record<string, unknown>; delayMs?: number },
): Promise<SseServer> {
  const sse = await startSseServer();
  await routeStreamTo(page, sse);
  for (const a of opts.activities ?? []) {
    sse.sendActivity(a);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  for (const t of opts.tokens ?? []) {
    sse.sendToken(t);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  sse.sendDone(opts.done);
  sse.end();
  return sse;
}
