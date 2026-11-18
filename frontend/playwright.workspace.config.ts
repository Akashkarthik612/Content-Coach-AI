import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/workspace',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../reports/workspace-test-results',
  use: { baseURL: 'http://127.0.0.1:4186', viewport: { width: 1920, height: 1080 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4186 --strictPort --configLoader native',
    url: 'http://127.0.0.1:4186',
    env: { VITE_AUTH_MODE: 'local', VITE_API_BASE_URL: '', VITE_SUPABASE_URL: 'https://placeholder.supabase.co', VITE_SUPABASE_ANON_KEY: 'local-ui-test' },
    reuseExistingServer: false,
    timeout: 60000,
  },
})
