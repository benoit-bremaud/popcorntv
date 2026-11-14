import { defineConfig, devices } from '@playwright/test';

/** Production-build smoke, isolated from any running local/staging application. */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json']],
  use: { baseURL: 'http://127.0.0.1:5174' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
});
