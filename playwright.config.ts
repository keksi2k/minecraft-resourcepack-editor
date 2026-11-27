import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: the built app in a real browser, with Mojang's servers faked (see e2e/fakeMojang.ts).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    // requests made by the service worker would bypass the faked servers
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  // Playwright's own Chromium (in its new headless mode); PW_CHANNEL=chrome uses an installed Google Chrome instead
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL ?? 'chromium', viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4179 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
