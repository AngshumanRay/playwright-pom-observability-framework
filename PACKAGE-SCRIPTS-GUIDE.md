# Package Scripts & Dependencies Guide

> This document explains every npm script and dependency in `package.json`,
> since JSON files cannot contain inline comments.

---

## npm Scripts Reference

### `npm run clean:reports`
**What it does:** Deletes all generated report folders before a fresh test run.  
**Folders removed:** `Reports/`, `artifacts/`, `allure-results/`, `allure-report/`  
**When to use:** Automatically called by `npm run reports`. You can also run it manually before a clean test run.

### `npm run test`
**What it does:** Runs all Playwright tests using `playwright test`.  
**Config used:** `playwright.config.ts` (discovers all `.spec.ts` files in `tests/`).  
**Browsers:** Chromium + Firefox (as defined in the config's `projects` array).  
**Reporters activated:** list, HTML, Allure, observability-reporter, UniversalReporter.

### `npm run test:headed`
**What it does:** Runs tests with visible browser windows (not headless).  
**When to use:** Debugging — you can watch the browser actions in real time.

### `npm run test:debug`
**What it does:** Launches the Playwright Inspector for step-by-step debugging.  
**When to use:** When you need to pause at specific steps, inspect selectors, or debug flaky tests.

### `npm run report:playwright`
**What it does:** Opens the Playwright HTML report in your browser.  
**Report location:** `Reports/playwright-html/index.html`  
**What it shows:** Test results with screenshots, videos, and traces for failed tests.

### `npm run report:allure:generate`
**What it does:** Generates the Allure HTML report from raw JSON results.  
**Input:** `Reports/allure-results/` (JSON files written by `allure-playwright` during tests)  
**Output:** `Reports/allure-report/` (browsable HTML report)

### `npm run report:allure:open`
**What it does:** Opens the generated Allure report in your browser.  
**Prerequisite:** Must run `report:allure:generate` first.

### `npm run report:3d`
**What it does:** Generates the 3D Performance & Accessibility Benchmark Dashboard.  
**Script:** `scripts/generate-performance-benchmark-report.ts` (run via `tsx`)  
**Input:** `Reports/observability/observability-metrics.json` (written by `observability-reporter.ts`)  
**Output:** `Reports/observability/performance-benchmark-report.html`

### `npm run reports` ⭐ (Main Command)
**What it does:** The ONE command to run everything end-to-end:
1. `clean:reports` — wipe old reports
2. `test` — run all tests (captures metrics + accessibility)
3. `report:3d` — generate 3D benchmark dashboard
4. `report:allure:generate` — generate Allure report

**Important:** Even if tests fail, the reports are still generated (exit code preserved).

### `npm run report:open:all`
**What it does:** Opens all 3 HTML reports simultaneously in your browser.  
**Reports opened:**
- Playwright HTML report
- Allure report
- 3D Benchmark Dashboard

---

## Dependencies Explained

All dependencies are `devDependencies` because this is a testing framework — it produces no production runtime output.

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | ^1.58.0 | Core testing framework — browser automation, assertions, test runner, fixtures |
| `@types/node` | ^22.13.10 | TypeScript type definitions for Node.js APIs (fs, path, process, etc.) |
| `allure-commandline` | ^2.34.1 | CLI tool to generate Allure HTML reports from JSON results |
| `allure-playwright` | ^3.4.5 | Playwright reporter adapter that writes Allure-compatible JSON results |
| `tsx` | ^4.19.2 | TypeScript executor — runs `.ts` files directly without pre-compilation |
| `typescript` | ^5.7.3 | TypeScript compiler — provides type-checking and IDE support |

---

## Key Package Metadata

| Field | Value | Purpose |
|-------|-------|---------|
| `name` | `playwright-observability-framework` | Package identifier |
| `version` | `1.0.0` | Current version |
| `private` | `true` | Prevents accidental publishing to npm registry |
| `description` | _(see package.json)_ | Short project description |
