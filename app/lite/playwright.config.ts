import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 30000, retries: 0, workers: 1,
  // On CI also write GitHub annotations: failures stay readable from the checks API without downloading logs.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  // 개편 A 6단계(대표 11-14): 새 화면이 기본이 됐다. 기존 검사들은 이전 화면(hangit:look=v2)을 계속 지키고,
  // 새 화면 검사(e2e/today-*.spec.ts)는 ?look=v3이나 빈 저장소로 새 화면을 연다.
  use: { baseURL: 'http://127.0.0.1:8792', trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block', storageState: 'e2e/previous-screen.json' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {} } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'node e2e/server.mjs', url: 'http://127.0.0.1:8792', reuseExistingServer: false },
});
