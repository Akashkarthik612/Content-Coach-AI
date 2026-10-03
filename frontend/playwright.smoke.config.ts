import { defineConfig, devices } from '@playwright/test';

/**
 * Browser smoke: the built frontend talks to the REAL backend — no API mocks.
 *
 * - Backend: `python -m tests.smoke.serve` (repo root) runs the real app on
 *   :8000 against TEST_DATABASE_URL, with Gemini and Supabase's JWKS faked on
 *   :8090 (tests/smoke/fake_upstream.py).
 * - Frontend: built the way Vercel builds it — VITE_API_BASE_URL points at
 *   another origin, so every call is cross-origin and real CORS applies.
 *
 * Only supabase-js's own calls to Supabase Auth are mocked in the browser,
 * and the token they return is a real JWT the backend verifies.
 * Needs TEST_DATABASE_URL (a local throwaway Postgres with pgvector).
 */
const API = 'http://127.0.0.1:8000';
const WEB_PORT = 4175;

export default defineConfig({
  testDir: './tests/smoke',
  // One shared backend and fake Gemini whose replies are numbered: run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report-smoke' }], ['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'smoke-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: [
    {
      command: `${process.env.PYTHON ?? 'python'} -m tests.smoke.serve`,
      cwd: '..',
      url: `${API}/health`,
      env: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? '', THREAD_TURN_LIMIT: '3' },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: `npx vite build --outDir dist-smoke && npx vite preview --outDir dist-smoke --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: {
        VITE_API_BASE_URL: API,
        VITE_AUTH_MODE: 'supabase',
        VITE_SUPABASE_URL: 'https://mock-project.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
