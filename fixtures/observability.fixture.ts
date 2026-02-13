import { promises as fs } from 'node:fs';
import { Request, test as base, expect } from '@playwright/test';
import { AccessibilityScanResult, AccessibilityViolation, FixtureObservabilityMetrics } from '../observability/types';

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Run a lightweight accessibility audit using the browser's built-in Accessibility Tree. */
async function runAccessibilityScan(page: import('@playwright/test').Page): Promise<AccessibilityScanResult> {
  const violations: AccessibilityViolation[] = [];

  try {
    // 1. Images without alt text
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

    // 2. Buttons / links without accessible names
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

    // 3. Missing document language
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

    // 4. Form inputs without labels
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

    // 5. Heading order / skipped heading levels
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

    // 6. Color contrast — flag elements with very small text and no explicit contrast
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

    // 7. Missing landmark regions
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
    // If scan fails (e.g., page closed early), return empty results
  }

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

export const test = base.extend<{ observabilityAuto: void }>({
  observabilityAuto: [
    async ({ page }, use, testInfo) => {
      const requestStartedAt = new Map<Request, number>();
      const responseTimes: number[] = [];
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];

      let requestCount = 0;
      let requestFailureCount = 0;
      let responseErrorCount = 0;

      const testStartedAtMs = Date.now();

      page.on('request', (request) => {
        requestCount += 1;
        requestStartedAt.set(request, Date.now());
      });

      page.on('requestfinished', (request) => {
        const startedAt = requestStartedAt.get(request);
        if (startedAt) {
          responseTimes.push(Date.now() - startedAt);
          requestStartedAt.delete(request);
        }
      });

      page.on('requestfailed', (request) => {
        requestFailureCount += 1;
        requestStartedAt.delete(request);
      });

      page.on('response', (response) => {
        if (response.status() >= 400) {
          responseErrorCount += 1;
        }
      });

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });

      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await use();

      // Run accessibility scan after test completes
      let accessibility: AccessibilityScanResult = {
        totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, violations: []
      };
      try {
        accessibility = await runAccessibilityScan(page);
      } catch {
        // Page may have been closed
      }

      const testEndedAtMs = Date.now();

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

      const attachmentPath = testInfo.outputPath('observability-metrics.json');
      await fs.writeFile(attachmentPath, JSON.stringify(metrics, null, 2), 'utf-8');
      await testInfo.attach('observability-metrics', {
        path: attachmentPath,
        contentType: 'application/json'
      });
    },
    { auto: true }
  ]
});

export { expect };
