import { defineConfig, devices } from '@playwright/test';

/**
 * Two build variants are required because VITE_AUTH_MODE is inlined into the
 * bundle at build time (Vite `import.meta.env`), not read at runtime — see
 * CLAUDE.md's Authentication Flow. `npm run test:e2e` builds both
 * (`dist-e2e-supabase`, `dist-e2e-local`) before Playwright starts.
 *
 * Every spec file runs against the "supabase" build (the prod default)
 * unless its filename contains `.local-auth.`, in which case it only runs
 * against the "local" build. See tests/e2e/README.md for the full rationale
 * and the list of which files are local-auth-only.
 */
const SUPABASE_PORT = 4173;
const LOCAL_AUTH_PORT = 4174;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'supabase-chromium',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SUPABASE_PORT}` },
      testIgnore: '**/*.local-auth.spec.ts',
    },
    {
      name: 'supabase-webkit',
      use: { ...devices['Desktop Safari'], baseURL: `http://localhost:${SUPABASE_PORT}` },
      testIgnore: '**/*.local-auth.spec.ts',
    },
    {
      name: 'local-auth-chromium',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${LOCAL_AUTH_PORT}` },
      testMatch: '**/*.local-auth.spec.ts',
    },
  ],

  webServer: [
    {
      command: `npx vite preview --outDir dist-e2e-supabase --port ${SUPABASE_PORT} --strictPort`,
      url: `http://localhost:${SUPABASE_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite preview --outDir dist-e2e-local --port ${LOCAL_AUTH_PORT} --strictPort`,
      url: `http://localhost:${LOCAL_AUTH_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
