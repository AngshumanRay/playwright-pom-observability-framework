/**
 * @file playwright.config.ts
 * @description Central Playwright Test configuration — the "brain" of the entire framework.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THIS IS THE FIRST FILE PLAYWRIGHT READS WHEN YOU RUN `npx playwright ║
 * ║  test`. Every setting here controls HOW tests run, WHAT gets captured, ║
 * ║  and WHERE reports are written.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * HOW THIS FILE FITS INTO THE PROJECT:
 *  - This config is read by Playwright at startup
 *  - It tells Playwright:
 *      1. WHERE to find tests       → `testDir: './tests'`
 *      2. HOW to execute them       → workers, retries, timeouts
 *      3. WHICH browsers to use     → Chromium + Firefox (2 projects)
 *      4. WHAT reporters to run     → 5 reporters (list, HTML, Allure, Observability, Universal)
 *      5. WHAT artifacts to capture → screenshots, video, traces for EVERY test
 *
 * KEY DECISIONS EXPLAINED:
 *  - **Workers: 1** — Sequential execution ensures benchmark metrics are stable
 *    (parallel tests would cause resource contention and unpredictable timings)
 *  - **screenshot/video/trace: 'on'** — Always capture everything, not just on failure,
 *    so the Universal Report can embed screenshots in the Tests tab
 *  - **5 reporters** — Each serves a different audience:
 *      • `list` — Real-time console output for developers watching the terminal
 *      • `html` — Playwright's built-in HTML report for debugging individual tests
 *      • `allure-playwright` — Rich Allure report with history, categories, graphs
 *      • `observability-reporter.ts` — Aggregates network/error/a11y metrics into JSON
 *      • `UniversalReporter.ts` — Generates the comprehensive 7-tab HTML report
 *
 * OUTPUT DIRECTORIES (all under `Reports/`):
 *  - `Reports/playwright-html/` — Playwright's built-in HTML report
 *  - `Reports/allure-results/` — Raw Allure result files (consumed by Allure CLI)
 *  - `Reports/observability/` — Custom metrics JSON + 3D benchmark dashboard
 *  - `Reports/universal-report/` — 7-tab Universal Report HTML
 *  - `Reports/test-results/` — Per-test screenshots, videos, trace files
 *
 * @see {@link ./fixtures/observability.fixture.ts} — Auto-fixture that captures metrics
 * @see {@link ./reporters/observability-reporter.ts} — Custom reporter that aggregates metrics
 * @see {@link ./reporters/UniversalReporter.ts} — 7-tab Universal Report generator
 * @see {@link ./PROJECT-ARCHITECTURE.md} — Full architecture documentation
 */

import { defineConfig, devices } from '@playwright/test';

/**
 * `defineConfig()` is a Playwright helper that provides TypeScript autocompletion
 * for all configuration options. Every option set here applies globally unless
 * overridden at the project level.
 */
export default defineConfig({

  // ═══════════════════════════════════════════════════════════════════════
  //  TEST DISCOVERY
  //  Where Playwright looks for test files (*.spec.ts, *.test.ts)
  // ═══════════════════════════════════════════════════════════════════════
  testDir: './tests',

  // ═══════════════════════════════════════════════════════════════════════
  //  EXECUTION SETTINGS
  //  Controls how tests are run: parallelism, retries, timeouts
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * `fullyParallel: false` — Tests run sequentially within each spec file.
   * This is important for benchmark accuracy: parallel tests would share CPU
   * and produce unreliable duration measurements.
   */
  fullyParallel: false,

  /**
   * `forbidOnly` — In CI environments, fail the entire run if someone left
   * `test.only()` in the code. This prevents accidentally running only one test
   * in production CI pipelines.
   */
  forbidOnly: !!process.env.CI,

  /**
   * `retries` — How many times to retry a failed test before marking it as failed.
   * - Locally: 1 retry (catches flaky failures without slowing development)
   * - CI: 2 retries (more tolerance for environment instability)
   * Tests that pass on retry are marked as "flaky" in reports.
   */
  retries: process.env.CI ? 2 : 1,

  /**
   * `workers: 1` — Run only one test at a time.
   * This is critical for observability: running tests in parallel would cause
   * network metrics to blend together and produce inaccurate benchmark scores.
   */
  workers: process.env.CI ? 1 : 1,

  /**
   * `timeout: 45_000` — Maximum time (45 seconds) for a single test to complete.
   * If a test takes longer, it's marked as "timedOut". This prevents stuck tests
   * from blocking the entire suite.
   */
  timeout: 45_000,

  /**
   * `expect.timeout` — Maximum time (10 seconds) for each `expect()` assertion
   * to pass. Playwright's `expect` auto-retries assertions until they pass or
   * this timeout expires.
   */
  expect: {
    timeout: 10_000
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  REPORTERS
  //  5 reporters run simultaneously during the test execution.
  //  Each one receives events (onTestBegin, onTestEnd, etc.) and produces output.
  // ═══════════════════════════════════════════════════════════════════════
  reporter: [
    // 1. `list` — Prints pass/fail status to the terminal in real-time
    ['list'],

    // 2. Playwright HTML Report — Visual test results with traces, screenshots, videos
    //    Output: Reports/playwright-html/index.html
    //    `open: 'never'` — Don't auto-open the browser after tests finish
    ['html', { outputFolder: 'Reports/playwright-html', open: 'never' }],

    // 3. Allure Report — Rich test management report with history tracking
    //    Output: Reports/allure-results/ (raw data, processed by `allure generate` later)
    //    `detail: true` — Include step-by-step details in the report
    ['allure-playwright', { resultsDir: 'Reports/allure-results', detail: true, suiteTitle: false }],

    // 4. Custom Observability Reporter — Reads per-test observability-metrics attachments
    //    and aggregates them into a single JSON file
    //    Output: Reports/observability/observability-metrics.json
    //    This JSON is later consumed by generate-performance-benchmark-report.ts
    ['./reporters/observability-reporter.ts'],

    // 5. Universal Reporter — Generates a comprehensive 7-tab HTML report
    //    with Dashboard, Tests, Performance, Observability, Security, Accessibility, Browsers
    //    Output: Reports/universal-report/index.html
    ['./reporters/UniversalReporter.ts', { outputDir: 'Reports/universal-report' }]
  ],

  // ═══════════════════════════════════════════════════════════════════════
  //  ARTIFACT OUTPUT
  //  Where Playwright saves screenshots, videos, and trace files for tests
  // ═══════════════════════════════════════════════════════════════════════
  outputDir: 'Reports/test-results',

  // ═══════════════════════════════════════════════════════════════════════
  //  SHARED SETTINGS (apply to ALL browser projects below)
  // ═══════════════════════════════════════════════════════════════════════
  use: {
    /**
     * `baseURL` — The root URL for all `page.goto()` calls. When a test calls
     * `page.goto('/docs/getting-started-vscode')`, Playwright prepends this URL.
     * Can be overridden via the `BASE_URL` environment variable.
     */
    baseURL: process.env.BASE_URL || 'https://playwright.dev',

    /**
     * `trace: 'on'` — Always record a trace ZIP file for every test.
     * Traces contain a step-by-step replay of the test with DOM snapshots,
     * network requests, and console logs. View at https://trace.playwright.dev
     */
    trace: 'on',

    /**
     * `screenshot: 'on'` — Capture a screenshot for every test (pass or fail).
     * The Universal Report embeds these as base64 images in the Tests tab.
     */
    screenshot: 'on',

    /**
     * `video: 'on'` — Record a video for every test. Videos are saved in the
     * test-results folder and can be reviewed to see exactly what happened.
     */
    video: 'on',

    /**
     * `actionTimeout: 10_000` — Maximum time (10 seconds) for individual browser
     * actions like click(), fill(), hover(). If an element can't be found or
     * interacted with in 10 seconds, the action fails.
     */
    actionTimeout: 10_000,

    /**
     * `navigationTimeout: 45_000` — Maximum time (45 seconds) for page.goto()
     * to complete. This accounts for slow network conditions or heavy pages.
     */
    navigationTimeout: 45_000
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  BROWSER PROJECTS
  //  Each project runs ALL tests in a specific browser. With 5 tests and
  //  2 browsers, you get 10 total test executions per run.
  // ═══════════════════════════════════════════════════════════════════════
  projects: [
    {
      /** Chromium — Chrome/Edge-based browser engine */
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }  // Uses Chrome's default viewport, user agent, etc.
    },
    {
      /** Firefox — Mozilla's Gecko browser engine */
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] } // Uses Firefox's default viewport, user agent, etc.
    }
  ]
});
