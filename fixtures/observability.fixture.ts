/**
 * @file observability.fixture.ts
 * @description Auto-fixture that transparently instruments every Playwright test.
 *
 * What it captures (with zero effort from the test author):
 *  - Network metrics: request count, failures, response times (avg / P95)
 *  - Console errors and unhandled page errors
 *  - Test duration & timestamps
 *  - Accessibility scan (7 WCAG rules) run after each test action completes
 *
 * All collected data is written to an `observability-metrics.json` attachment
 * which the custom ObservabilityReporter later aggregates into a single JSON.
 *
 * @see {@link ../reporters/observability-reporter.ts} — consumes these attachments
 * @see {@link ../observability/types.ts} — TypeScript interfaces for the metrics
 */

import { promises as fs } from 'node:fs';
import { Request, test as base, expect } from '@playwright/test';
import { AccessibilityScanResult, AccessibilityViolation, FixtureObservabilityMetrics } from '../observability/types';

// ---------------------------------------------------------------------------
//  Math utility helpers (duplicated here to avoid importing across packages)
// ---------------------------------------------------------------------------

/** Calculate the arithmetic mean of an array of numbers. Returns 0 for empty arrays. */
function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Return the p-th percentile from an array of numbers.
 * @param values - Array of numeric values
 * @param p - Percentile to compute (0-100)
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

/** Round a number to a given number of decimal places. */
function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
//  Accessibility scanner
// ---------------------------------------------------------------------------

/**
 * Run a lightweight accessibility audit using the browser's DOM.
 * Checks 7 common WCAG rules without any external dependency (no axe-core).
 *
 * Rules checked:
 *  1. Images without alt text
 *  2. Buttons without accessible names
 *  3. Links without accessible names
 *  4. Missing `<html lang>`
 *  5. Form inputs without labels
 *  6. Skipped heading levels
 *  7. Missing `<main>` landmark using the browser's built-in Accessibility Tree. */
async function runAccessibilityScan(page: import('@playwright/test').Page): Promise<AccessibilityScanResult> {
  const violations: AccessibilityViolation[] = [];

  try {
    // ── Rule 1: Images without alt text (WCAG 1.1.1) ──────────────────
    const imgsMissingAlt = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs.filter((img) => !img.getAttribute('alt') && !img.getAttribute('role')).length;
    });
    if (imgsMissingAlt > 0) {
      violations.push({
        id: 'image-alt',
        impact: 'critical',
        description: 'Images must have alternate text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
        nodes: imgsMissingAlt
      });
    }

    // ── Rule 2: Buttons without accessible names (WCAG 4.1.2) ──────
    const emptyButtons = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      return btns.filter(
        (btn) => !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')
      ).length;
    });
    if (emptyButtons > 0) {
      violations.push({
        id: 'button-name',
        impact: 'critical',
        description: 'Buttons must have discernible text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/button-name',
        nodes: emptyButtons
      });
    }

    // ── Rule 3: Links without accessible names (WCAG 2.4.4) ─────────
    const emptyLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links.filter(
        (a) => !a.textContent?.trim() && !a.getAttribute('aria-label') && !a.getAttribute('aria-labelledby') && !a.querySelector('img[alt]')
      ).length;
    });
    if (emptyLinks > 0) {
      violations.push({
        id: 'link-name',
        impact: 'serious',
        description: 'Links must have discernible text',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/link-name',
        nodes: emptyLinks
      });
    }

    // ── Rule 4: Missing document language (WCAG 3.1.1) ──────────────
    const missingLang = await page.evaluate(() => !document.documentElement.getAttribute('lang'));
    if (missingLang) {
      violations.push({
        id: 'html-has-lang',
        impact: 'serious',
        description: '<html> element must have a lang attribute',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/html-has-lang',
        nodes: 1
      });
    }

    // ── Rule 5: Form inputs without labels (WCAG 1.3.1) ─────────────
    const unlabeledInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.filter((el) => {
        const id = el.getAttribute('id');
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
        return !hasLabel && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
      }).length;
    });
    if (unlabeledInputs > 0) {
      violations.push({
        id: 'label',
        impact: 'critical',
        description: 'Form elements must have labels',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/label',
        nodes: unlabeledInputs
      });
    }

    // ── Rule 6: Heading order / skipped levels (WCAG 1.3.1) ─────────
    const skippedHeadings = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
      let skips = 0;
      let prev = 0;
      for (const h of headings) {
        const level = parseInt(h.tagName[1], 10);
        if (prev > 0 && level > prev + 1) skips++;
        prev = level;
      }
      return skips;
    });
    if (skippedHeadings > 0) {
      violations.push({
        id: 'heading-order',
        impact: 'moderate',
        description: 'Heading levels should increase by one',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/heading-order',
        nodes: skippedHeadings
      });
    }

    // ── Rule 7: Color contrast — flag elements with low-contrast text ─
    const lowContrastCandidates = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('p, span, a, li, td, th, label'));
      let count = 0;
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize);
        const color = style.color;
        const bg = style.backgroundColor;
        if (fontSize < 12 && color === bg) count++;
      }
      return count;
    });
    if (lowContrastCandidates > 0) {
      violations.push({
        id: 'color-contrast',
        impact: 'serious',
        description: 'Elements must have sufficient color contrast',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
        nodes: lowContrastCandidates
      });
    }

    // ── Rule 8: Missing <main> landmark region (WCAG 1.3.1) ─────────
    const hasMain = await page.evaluate(() => !!document.querySelector('main, [role="main"]'));
    if (!hasMain) {
      violations.push({
        id: 'landmark-main-is-top-level',
        impact: 'moderate',
        description: 'Page should contain a main landmark',
        helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/landmark-main-is-top-level',
        nodes: 1
      });
    }
  } catch {
    // Scan may fail if the page was closed early (e.g., navigation error).
    // In that case, return whatever violations we already collected.
  }

  // ── Aggregate violation counts by severity level ──────────────────
  const critical = violations.filter((v) => v.impact === 'critical').length;
  const serious = violations.filter((v) => v.impact === 'serious').length;
  const moderate = violations.filter((v) => v.impact === 'moderate').length;
  const minor = violations.filter((v) => v.impact === 'minor').length;

  return {
    totalViolations: violations.length,
    critical,
    serious,
    moderate,
    minor,
    violations
  };
}

// ---------------------------------------------------------------------------
//  Auto-fixture: observability instrumentation
// ---------------------------------------------------------------------------

/**
 * Extended Playwright `test` object with an auto-fixture (`observabilityAuto`)
 * that hooks into every test without the test author writing any extra code.
 *
 * Lifecycle:
 *  1. **Before the test** — attach event listeners for requests, responses,
 *     console messages and page errors.
 *  2. **During the test** — listeners silently accumulate metrics.
 *  3. **After the test** — run the accessibility scan, compute aggregates,
 *     and save the metrics as a JSON attachment on the test result.
 */
export const test = base.extend<{ observabilityAuto: void }>({
  observabilityAuto: [
    async ({ page }, use, testInfo) => {
      // ── Tracking variables ──────────────────────────────────────────
      /** Maps each in-flight request to its start timestamp (ms). */
      const requestStartedAt = new Map<Request, number>();
      /** Collected response times for every completed request (ms). */
      const responseTimes: number[] = [];
      /** Console error messages captured during the test. */
      const consoleErrors: string[] = [];
      /** Unhandled page error messages captured during the test. */
      const pageErrors: string[] = [];

      let requestCount = 0;        // Total network requests
      let requestFailureCount = 0; // Requests that failed (network error)
      let responseErrorCount = 0;  // Responses with HTTP status >= 400

      const testStartedAtMs = Date.now();

      // ── Event listeners (attached before test runs) ────────────────

      /** Track every outgoing network request. */
      page.on('request', (request) => {
        requestCount += 1;
        requestStartedAt.set(request, Date.now());
      });

      /** When a request completes, record its response time. */
      page.on('requestfinished', (request) => {
        const startedAt = requestStartedAt.get(request);
        if (startedAt) {
          responseTimes.push(Date.now() - startedAt);
          requestStartedAt.delete(request);
        }
      });

      /** Track network-level failures (DNS, TLS, connection refused, etc.). */
      page.on('requestfailed', (request) => {
        requestFailureCount += 1;
        requestStartedAt.delete(request);
      });

      /** Count HTTP responses with 4xx / 5xx status codes. */
      page.on('response', (response) => {
        if (response.status() >= 400) {
          responseErrorCount += 1;
        }
      });

      /** Capture console.error() calls from the page. */
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });

      /** Capture unhandled JavaScript errors (window.onerror). */
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      // ── Hand control to the test ───────────────────────────────────
      await use();

      // ── Post-test: accessibility scan ──────────────────────────────
      let accessibility: AccessibilityScanResult = {
        totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, violations: []
      };
      try {
        accessibility = await runAccessibilityScan(page);
      } catch {
        // Page may already have been closed; use empty result
      }

      const testEndedAtMs = Date.now();

      // ── Build the metrics object ───────────────────────────────────
      const metrics: FixtureObservabilityMetrics = {
        requestCount,
        requestFailureCount,
        responseErrorCount,
        responseTimesMs: responseTimes,
        avgResponseTimeMs: round(average(responseTimes)),
        p95ResponseTimeMs: round(percentile(responseTimes, 95)),
        consoleErrors,
        pageErrors,
        testStartedAt: new Date(testStartedAtMs).toISOString(),
        testEndedAt: new Date(testEndedAtMs).toISOString(),
        testDurationMs: testEndedAtMs - testStartedAtMs,
        accessibility
      };

      // ── Save metrics as a test attachment ───────────────────────────
      // The ObservabilityReporter reads this attachment after the run.
      const attachmentPath = testInfo.outputPath('observability-metrics.json');
      await fs.writeFile(attachmentPath, JSON.stringify(metrics, null, 2), 'utf-8');
      await testInfo.attach('observability-metrics', {
        path: attachmentPath,
        contentType: 'application/json'
      });
    },
    { auto: true } // `auto: true` means this fixture runs for EVERY test
  ]
});

export { expect };
