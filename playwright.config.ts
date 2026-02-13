import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'Reports/playwright-html', open: 'never' }],
    ['allure-playwright', { resultsDir: 'Reports/allure-results', detail: true, suiteTitle: false }],
    ['./reporters/observability-reporter.ts']
  ],
  outputDir: 'Reports/test-results',
  use: {
    baseURL: process.env.BASE_URL || 'https://playwright.dev',
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 10_000,
    navigationTimeout: 45_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    }
  ]
});
