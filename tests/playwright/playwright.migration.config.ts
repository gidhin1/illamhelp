import { defineConfig, devices } from '@playwright/test';

const firefoxEndpoint = process.env.PW_FIREFOX_WS_ENDPOINT;

export default defineConfig({
  testDir: './migration',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: { headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { outputFolder: './reports/migration', open: 'never' }]],
  webServer: process.env.PW_AUDIT_EXTERNAL === 'true' ? undefined : [
    { command: 'corepack pnpm --filter @illamhelp/web exec next start -H 127.0.0.1 -p 3200', url: 'http://127.0.0.1:3200', reuseExistingServer: false, cwd: '../..' },
    { command: 'corepack pnpm --filter @illamhelp/admin exec next start -H 127.0.0.1 -p 3203', url: 'http://127.0.0.1:3203', reuseExistingServer: false, cwd: '../..' },
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        connectOptions: firefoxEndpoint ? { wsEndpoint: firefoxEndpoint, exposeNetwork: '<loopback>' } : undefined
      }
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
