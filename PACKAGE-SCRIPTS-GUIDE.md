# Package Scripts & Dependencies Guide

> This document explains every npm script and dependency in `package.json`,
> since JSON files cannot contain inline comments.

---

## npm Scripts Reference

### `npm run clean:reports`
**What it does:** Deletes all generated report folders before a fresh test run.  
**Folders removed:** `Reports/`, `artifacts/`  
**When to use:** Automatically called by `npm run reports`. You can also run it manually before a clean test run.

### `npm run test`
**What it does:** Runs all Playwright tests using `playwright test`.  
**Config used:** `playwright.config.ts` (discovers all `.spec.ts` files in `tests/`).  
**Browsers:** Chromium + Firefox (as defined in the config's `projects` array).  
**Reporters activated:** list, HTML, UniversalReporter.

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

### `npm run reports` ⭐ (Main Command)
**What it does:** The ONE command to run everything end-to-end:
1. `clean:reports` — wipe old reports
2. `test` — run all tests (captures metrics + accessibility + generates both reports)

### `npm run report:open:all`
**What it does:** Opens both HTML reports simultaneously in your browser.  
**Reports opened:**
- Playwright HTML report
- Universal Report (7-tab)

---

## Dependencies Explained

All dependencies are `devDependencies` because this is a testing framework — it produces no production runtime output.

| Package | Version | Purpose |
|---------|---------|---------|
| `@playwright/test` | ^1.58.0 | Core testing framework — browser automation, assertions, test runner, fixtures |
| `@types/node` | ^22.13.10 | TypeScript type definitions for Node.js APIs (fs, path, process, etc.) |
| `typescript` | ^5.7.3 | TypeScript compiler — provides type-checking and IDE support |

---

## Key Package Metadata

| Field | Value | Purpose |
|-------|-------|---------|
| `name` | `playwright-observability-framework` | Package identifier |
| `version` | `1.0.0` | Current version |
| `private` | `true` | Prevents accidental publishing to npm registry |
| `description` | _(see package.json)_ | Short project description |
