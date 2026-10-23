import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 30000, retries: 0, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8792', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'node e2e/server.mjs', url: 'http://127.0.0.1:8792', reuseExistingServer: false },
});
