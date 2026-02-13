/**
 * @file playwright.config.ts
 * @description Central Playwright Test configuration.
 *
 * Key settings:
 *  - **Browsers**: Chromium + Firefox (2 projects)
 *  - **Workers**: 1 (sequential execution for stable metrics)
 *  - **Reporters**: list, HTML, Allure, custom Observability reporter
 *  - **Artifacts**: screenshots, video & trace captured for EVERY test (`'on'`)
 *  - **Base URL**: playwright.dev (overridable via `BASE_URL` env var)
 *
 * Output directories (all under `Reports/`):
 *  - `Reports/playwright-html/` — Playwright's built-in HTML report
 *  - `Reports/allure-results/` — raw Allure result files
 *  - `Reports/observability/` — custom metrics JSON + benchmark dashboard
 *  - `Reports/test-results/` — screenshots, videos, traces per test
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // ── Test discovery ──────────────────────────────────────────────────────
  testDir: './tests',

  // ── Execution ──────────────────────────────────────────────────────────
  fullyParallel: false,            // Run tests sequentially for deterministic metrics
  forbidOnly: !!process.env.CI,    // Fail CI if test.only() is left in
  retries: process.env.CI ? 2 : 1, // Retry once locally, twice in CI
  workers: process.env.CI ? 1 : 1, // Single worker for stable benchmarking
  timeout: 45_000,                 // 45s max per test
  expect: {
    timeout: 10_000               // 10s max for each expect() assertion
  },

  // ── Reporters ──────────────────────────────────────────────────────────
  reporter: [
    ['list'],                                                                          // Console output
    ['html', { outputFolder: 'Reports/playwright-html', open: 'never' }],              // Playwright HTML
    ['allure-playwright', { resultsDir: 'Reports/allure-results', detail: true, suiteTitle: false }], // Allure
    ['./reporters/observability-reporter.ts']                                           // Custom metrics
  ],

  // ── Artifact output ────────────────────────────────────────────────────
  outputDir: 'Reports/test-results',

  // ── Shared settings for all projects ───────────────────────────────────
  use: {
    baseURL: process.env.BASE_URL || 'https://playwright.dev',
    trace: 'on',              // Always capture trace (zip)
    screenshot: 'on',         // Always capture screenshots
    video: 'on',              // Always record video
    actionTimeout: 10_000,    // 10s max per individual action (click, fill, etc.)
    navigationTimeout: 45_000 // 45s max for page.goto()
  },

  // ── Browser projects ───────────────────────────────────────────────────
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
