/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                     UNIVERSAL PLAYWRIGHT REPORTER                          ║
 * ║                                                                            ║
 * ║  A single, self-contained file that generates a comprehensive HTML report  ║
 * ║  with 7 interactive tabs:                                                  ║
 * ║    📈 Dashboard  — KPIs, donut, bar, tier charts                          ║
 * ║    🧪 Tests      — expandable list with steps, screenshots, a11y          ║
 * ║    ⚡ Performance — 3D scatter, box plot, histogram, table                 ║
 * ║    🔭 Observability — network metrics, response times, console errors     ║
 * ║    🔒 Security   — HTTP error analysis, request failure patterns          ║
 * ║    ♿ Accessibility — violations, severity pie, WCAG rules                ║
 * ║    🌐 Browsers   — radar, pass rate, comparison table                     ║
 * ║                                                                            ║
 * ║  ZERO external dependencies — works on Windows, macOS, Linux.              ║
 * ║  Just drop this file into any Playwright project and register it.          ║
 * ║                                                                            ║
 * ║  Usage in playwright.config.ts:                                            ║
 * ║    reporter: [['./reporters/UniversalReporter.ts']]                        ║
 * ║                                                                            ║
 * ║  Or via CLI:                                                               ║
 * ║    npx playwright test --reporter=./reporters/UniversalReporter.ts         ║
 * ║                                                                            ║
 * ║  Output: Reports/universal-report/index.html                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * HOW THIS REPORTER FITS INTO THE PROJECT:
 *
 *   This is a STANDALONE reporter — it can work in ANY Playwright project.
 *   In our project, it's one of 5 reporters registered in playwright.config.ts.
 *
 *   DATA SOURCES:
 *   1. Playwright's TestCase/TestResult objects → test metadata, status, steps, errors
 *   2. observability-metrics attachment → network counts, response times, console/page errors
 *   3. Same attachment's .accessibility field → WCAG violations, severity counts
 *   4. Screenshot attachments → base64-encoded images embedded in the Tests tab
 *
 *   WHAT MAKES THIS DIFFERENT FROM observability-reporter.ts:
 *   - observability-reporter.ts writes a JSON file (for the benchmark script to read)
 *   - This reporter writes a complete HTML report (for humans to view)
 *   - This reporter also computes security analysis, benchmark scores, and tiers
 *   - This reporter embeds screenshots directly in the HTML (base64)
 *
 * ARCHITECTURE OF THIS FILE:
 *   1. Internal types (UTest, UObservability, UA11y, UPayload, etc.)
 *   2. Math utilities (round, clamp, avg, median, percentile, scoring)
 *   3. Reporter class implementing Playwright's Reporter interface:
 *      - onBegin() → record start time
 *      - onTestEnd() → collect test data, parse attachments
 *      - onEnd() → build payload, generate HTML, write to disk
 *   4. Helper methods for parsing observability/a11y data
 *   5. buildPayload() → computes all scores, aggregations, breakdowns
 *   6. buildHtml() → generates the entire HTML string with CSS + JS + Plotly charts
 *
 * @see {@link ../UNIVERSAL-REPORT-WALKTHROUGH.md} — detailed guide to the 7 tabs
 * @see {@link ../PROJECT-ARCHITECTURE.md} — full project architecture
 */

import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  TestStep,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/* ═══════════════════════════════════════════════════════════════════════════
 *  INTERNAL TYPES — no external imports needed
 *
 *  These types are INTERNAL to this reporter (not shared with other files).
 *  They mirror some types from observability/types.ts but are intentionally
 *  duplicated to keep this reporter as a standalone, drop-in file.
 *
 *  KEY TYPES:
 *    UTest         — Raw test data collected during onTestEnd()
 *    UTestEnriched — UTest + computed benchmark score + tier + a11y data
 *    UObservability— Network/error metrics parsed from the attachment
 *    UA11y         — Accessibility scan data parsed from the attachment
 *    UPayload      — The complete data structure rendered into the HTML report
 * ═══════════════════════════════════════════════════════════════════════════ */

interface UAttachment {
  name: string;
  contentType: string;
  path?: string;
  body?: string;
  base64?: string;
}

interface UStep {
  title: string;
  category: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
  steps: UStep[];
}

/** Observability metrics extracted from the observability-metrics attachment */
interface UObservability {
  requestCount: number;
  requestFailureCount: number;
  responseErrorCount: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  maxResponseTimeMs: number;
  consoleErrors: string[];
  pageErrors: string[];
}

interface UTest {
  id: string;
  title: string;
  fullTitle: string;
  project: string;
  browser: string;
  file: string;
  line: number;
  duration: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  retry: number;
  startedAt: string;
  steps: UStep[];
  errors: string[];
  attachments: UAttachment[];
  tags: string[];
  observability: UObservability;
}

interface UA11y {
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  violations: { id: string; impact: string; description: string; nodes: number }[];
}

interface UTestEnriched extends UTest {
  benchmarkScore: number;
  benchmarkTier: string;
  accessibility: UA11y;
}

interface UBrowserRow {
  browser: string;
  total: number;
  passed: number;
  failed: number;
  avgDuration: number;
  medianDuration: number;
  p95Duration: number;
  passRate: number;
  benchmarkScore: number;
  tier: string;
  a11yViolations: number;
  totalRequests: number;
  requestFailures: number;
  avgResponseTime: number;
}

interface UPayload {
  generatedAt: string;
  duration: number;
  workers: number;
  rootDir: string;
  platform: string;
  nodeVersion: string;
  playwrightVersion: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    passRate: number;
    avgDuration: number;
    medianDuration: number;
    p95Duration: number;
    p99Duration: number;
    throughputPerMin: number;
    benchmarkScore: number;
    benchmarkTier: string;
  };
  observability: {
    totalRequests: number;
    requestFailures: number;
    requestFailureRate: number;
    responseErrors: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    maxResponseTimeMs: number;
    totalConsoleErrors: number;
    totalPageErrors: number;
    consoleErrors: string[];
    pageErrors: string[];
    networkScore: number;
    errorScore: number;
    observabilityScore: number;
  };
  security: {
    httpErrorCount: number;
    networkFailureCount: number;
    consoleErrorCount: number;
    pageErrorCount: number;
    securityScore: number;
    riskLevel: string;
    findings: { severity: string; category: string; description: string; count: number }[];
  };
  accessibility: {
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    score: number;
    testsScanned: number;
    testsWithViolations: number;
    topViolations: { id: string; impact: string; description: string; count: number }[];
  };
  browsers: UBrowserRow[];
  tests: UTestEnriched[];
  fileBreakdown: { file: string; total: number; passed: number; failed: number; avgDuration: number }[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  MATH UTILITIES
 *  Duplicated here (not imported) to keep this reporter as a standalone file
 *  that can be dropped into any Playwright project without additional imports.
 *
 *  Scoring functions:
 *    scoreLow(val, target, max)  — 100 if val≤target, 0 if val≥max (lower is better)
 *    scoreHigh(val, min, target) — 100 if val≥target, 0 if val≤min (higher is better)
 *    tier(score)                 — Maps 0-100 score to Elite/Strong/Stable/Watch/Critical
 *    riskLevel(score)            — Maps 0-100 score to Low/Medium/High/Critical
 * ═══════════════════════════════════════════════════════════════════════════ */

function round(v: number, d = 2): number {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, x) => s + x, 0) / arr.length;
}
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pctl(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.ceil((p / 100) * s.length) - 1;
  return s[clamp(i, 0, s.length - 1)];
}
function scoreLow(val: number, target: number, max: number): number {
  if (val <= target) return 100;
  if (val >= max) return 0;
  return round(clamp((1 - (val - target) / (max - target)) * 100, 0, 100));
}
function scoreHigh(val: number, min: number, target: number): number {
  if (val >= target) return 100;
  if (val <= min) return 0;
  return round(clamp(((val - min) / (target - min)) * 100, 0, 100));
}
function tier(score: number): string {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Stable';
  if (score >= 40) return 'Watch';
  return 'Critical';
}
function riskLevel(score: number): string {
  if (score >= 90) return 'Low';
  if (score >= 70) return 'Medium';
  if (score >= 40) return 'High';
  return 'Critical';
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  EMPTY DEFAULTS
 *  Used when a test has no observability or accessibility data available
 *  (e.g., test failed before the fixture could capture metrics, or the
 *  reporter is used in a project without the observability fixture).
 * ═══════════════════════════════════════════════════════════════════════════ */

const EMPTY_OBS: UObservability = {
  requestCount: 0, requestFailureCount: 0, responseErrorCount: 0,
  avgResponseTimeMs: 0, p95ResponseTimeMs: 0, maxResponseTimeMs: 0,
  consoleErrors: [], pageErrors: [],
};

const EMPTY_A11Y: UA11y = {
  totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, violations: [],
};

/* ═══════════════════════════════════════════════════════════════════════════
 *  REPORTER CLASS
 *
 *  This class implements Playwright's Reporter interface.
 *  Playwright calls its methods at different points in the test lifecycle:
 *
 *    onBegin(config, suite)     → Suite starts → We record the start time
 *    onTestEnd(test, result)    → Each test ends → We collect data + attachments
 *    onEnd(result)              → ALL tests done → We build payload + write HTML
 *
 *  The reporter is registered in playwright.config.ts:
 *    reporter: [['./reporters/UniversalReporter.ts', { outputDir: '...' }]]
 * ═══════════════════════════════════════════════════════════════════════════ */

class UniversalReporter implements Reporter {
  private startMs = 0;
  private tests: UTest[] = [];
  private config!: FullConfig;
  private outputDir: string;
  private outputFile: string;

  constructor(options?: { outputDir?: string; outputFile?: string }) {
    this.outputDir = options?.outputDir || path.join('Reports', 'universal-report');
    this.outputFile = options?.outputFile || 'index.html';
  }

  /* ── Lifecycle: onBegin ──────────────────────────────────────────────── */

  onBegin(config: FullConfig, _suite: Suite): void {
    this.startMs = Date.now();
    this.config = config;
    console.log('\n🚀 Universal Reporter — collecting data …\n');
  }

  /* ── Lifecycle: onTestEnd — collect everything about the test ────────── */

  onTestEnd(test: TestCase, result: TestResult): void {
    const titlePath = test.titlePath().filter(Boolean);
    const project = test.parent?.project()?.name || 'default';
    const browserName = this.guessBrowser(project, titlePath);

    const attachments: UAttachment[] = result.attachments.map((att) => {
      const ua: UAttachment = {
        name: att.name,
        contentType: att.contentType,
        path: att.path,
      };
      if (att.contentType.startsWith('image/') && att.path) {
        try {
          const buf = fs.readFileSync(att.path);
          ua.base64 = buf.toString('base64');
        } catch { /* file may have been cleaned up */ }
      }
      if (att.contentType === 'application/json') {
        try {
          if (att.body) {
            ua.body = att.body.toString('utf-8');
          } else if (att.path) {
            ua.body = fs.readFileSync(att.path, 'utf-8');
          }
        } catch { /* ignore */ }
      }
      return ua;
    });

    // Extract observability metrics from the attachment
    const observability = this.parseObservability(attachments);

    this.tests.push({
      id: test.id,
      title: test.title,
      fullTitle: titlePath.join(' › '),
      project,
      browser: browserName,
      file: path.relative(process.cwd(), test.location.file).split(path.sep).join('/'),
      line: test.location.line,
      duration: result.duration,
      status: result.status,
      retry: result.retry,
      startedAt: result.startTime.toISOString(),
      steps: this.serializeSteps(result.steps),
      errors: result.errors.map((e) => e.message || e.stack || String(e)),
      attachments,
      tags: (test as any).tags || [],
      observability,
    });
  }

  /* ── Lifecycle: onEnd — build payload & write HTML ──────────────────── */

  async onEnd(_result: FullResult): Promise<void> {
    const duration = Date.now() - this.startMs;
    const payload = this.buildPayload(duration);
    const html = this.buildHtml(payload);

    const outDir = path.resolve(process.cwd(), this.outputDir);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, this.outputFile);
    fs.writeFileSync(outPath, html, 'utf-8');

    const sizeKB = round(fs.statSync(outPath).size / 1024, 1);
    const O = payload.observability;
    const Sec = payload.security;
    console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
    console.log(`║  📊 UNIVERSAL REPORT                                        ║`);
    console.log(`╠══════════════════════════════════════════════════════════════╣`);
    console.log(`║  File : ${outPath}`);
    console.log(`║  Size : ${sizeKB} KB`);
    console.log(`║  Tests: ${payload.summary.total}  |  Pass: ${payload.summary.passed}  |  Fail: ${payload.summary.failed}  |  Skip: ${payload.summary.skipped}`);
    console.log(`║  Score: ${payload.summary.benchmarkScore}/100 [${payload.summary.benchmarkTier}]`);
    console.log(`║  A11y : ${payload.accessibility.totalViolations} violations  (score ${payload.accessibility.score}/100)`);
    console.log(`║  Observability: ${O.totalRequests} requests  |  ${O.totalConsoleErrors} console errors  |  ${O.totalPageErrors} page errors`);
    console.log(`║  Network: avg ${O.avgResponseTimeMs}ms  |  P95 ${O.p95ResponseTimeMs}ms  |  failures ${O.requestFailures}`);
    console.log(`║  Security: score ${Sec.securityScore}/100  |  risk ${Sec.riskLevel}  |  ${Sec.findings.length} findings`);
    console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */

  private guessBrowser(project: string, titlePath: string[]): string {
    const p = project.toLowerCase();
    if (p.includes('chromium') || p.includes('chrome') || p.includes('canary')) return 'chromium';
    if (p.includes('firefox') || p.includes('gecko')) return 'firefox';
    if (p.includes('webkit') || p.includes('safari')) return 'webkit';
    if (p.includes('edge') || p.includes('msedge')) return 'edge';
    const first = (titlePath[0] || '').toLowerCase();
    if (['chromium', 'firefox', 'webkit', 'edge'].includes(first)) return first;
    return project || 'unknown';
  }

  private serializeSteps(steps: TestStep[]): UStep[] {
    return steps.map((s) => ({
      title: s.title,
      category: s.category || 'test',
      duration: s.duration,
      status: s.error ? 'failed' : 'passed',
      error: s.error?.message,
      steps: s.steps ? this.serializeSteps(s.steps) : [],
    }));
  }

  /* ── Parse observability-metrics attachment ─────────────────────────────
   * Looks for the 'observability-metrics' JSON attachment that the
   * observability.fixture.ts saves for each test. Extracts network counts,
   * response times, and error arrays.
   *
   * If the attachment doesn't exist (e.g., no observability fixture installed),
   * returns EMPTY_OBS with all zeros — the report still works, just without
   * network/error data.
   */

  private parseObservability(attachments: UAttachment[]): UObservability {
    for (const att of attachments) {
      if (att.name === 'observability-metrics' && att.contentType === 'application/json' && att.body) {
        try {
          const data = JSON.parse(att.body);
          return {
            requestCount: data.requestCount ?? 0,
            requestFailureCount: data.requestFailureCount ?? 0,
            responseErrorCount: data.responseErrorCount ?? 0,
            avgResponseTimeMs: round(data.avgResponseTimeMs ?? 0),
            p95ResponseTimeMs: round(data.p95ResponseTimeMs ?? 0),
            maxResponseTimeMs: round(
              Array.isArray(data.responseTimesMs) && data.responseTimesMs.length
                ? Math.max(...data.responseTimesMs)
                : 0
            ),
            consoleErrors: Array.isArray(data.consoleErrors) ? data.consoleErrors : [],
            pageErrors: Array.isArray(data.pageErrors) ? data.pageErrors : [],
          };
        } catch { /* ignore */ }
      }
    }
    return { ...EMPTY_OBS };
  }

  /* ── Parse accessibility results from test attachments ──────────────────
   * Looks for accessibility data in attachments. Supports two formats:
   *
   * 1. OUR OBSERVABILITY FIXTURE FORMAT:
   *    Attachment name = 'observability-metrics', contains { accessibility: {...} }
   *    This is the format produced by our observability.fixture.ts
   *
   * 2. AXE-CORE FORMAT:
   *    Attachment name contains 'access', 'a11y', or 'axe'
   *    Contains { violations: [{id, impact, nodes:[...]}] }
   *    This format is produced by @axe-core/playwright or similar tools
   *
   * This dual-format support means the Universal Reporter works with both
   * our custom scanner AND third-party accessibility tools.
   */

  private parseA11y(attachments: UAttachment[]): UA11y {
    for (const att of attachments) {
      if (att.contentType !== 'application/json' || !att.body) continue;
      const nameLC = att.name.toLowerCase();

      // Observability fixture format: { accessibility: { ... }, requestCount: ... }
      if (nameLC === 'observability-metrics') {
        try {
          const data = JSON.parse(att.body);
          if (typeof data.accessibility === 'object') {
            const a = data.accessibility;
            return {
              totalViolations: a.totalViolations || 0,
              critical: a.critical || 0,
              serious: a.serious || 0,
              moderate: a.moderate || 0,
              minor: a.minor || 0,
              violations: Array.isArray(a.violations) ? a.violations : [],
            };
          }
        } catch { /* ignore */ }
      }

      // axe-core or generic a11y attachment
      if (nameLC.includes('access') || nameLC.includes('a11y') || nameLC.includes('axe')) {
        try {
          const data = JSON.parse(att.body);
          if (Array.isArray(data.violations)) {
            const violations = data.violations.map((v: any) => ({
              id: v.id || 'unknown',
              impact: v.impact || 'minor',
              description: v.description || v.help || '',
              nodes: Array.isArray(v.nodes) ? v.nodes.length : 1,
            }));
            return {
              totalViolations: violations.length,
              critical: violations.filter((v: any) => v.impact === 'critical').length,
              serious: violations.filter((v: any) => v.impact === 'serious').length,
              moderate: violations.filter((v: any) => v.impact === 'moderate').length,
              minor: violations.filter((v: any) => v.impact === 'minor').length,
              violations,
            };
          }
        } catch { /* ignore */ }
      }
    }
    return { ...EMPTY_A11Y };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  BUILD THE DATA PAYLOAD
   *
   *  This is the heart of the reporter. It takes all collected test data
   *  and computes:
   *    - Summary statistics (pass rate, avg duration, throughput, etc.)
   *    - Observability aggregates (total requests, failures, response times)
   *    - Security analysis (findings, risk level, security score)
   *    - Accessibility aggregates (violations by severity, top violations)
   *    - Browser breakdown (per-browser stats)
   *    - File breakdown (per-file stats)
   *    - Per-test benchmark scores and tiers
   *
   *  The resulting UPayload object is serialized as JSON and embedded
   *  in the HTML report, where client-side JavaScript renders charts.
   * ═══════════════════════════════════════════════════════════════════════ */

  private buildPayload(duration: number): UPayload {
    const enriched: UTestEnriched[] = this.tests.map((t) => {
      const a11y = this.parseA11y(t.attachments);
      const durationScore = scoreLow(t.duration, 2000, 15000);
      const reliabilityScore = t.status === 'passed' ? 100 : t.status === 'skipped' ? 50 : 10;
      const retryPenalty = t.retry * 15;
      const a11yPenalty = a11y.critical * 4 + a11y.serious * 3 + a11y.moderate * 2 + a11y.minor;
      const benchmarkScore = round(
        clamp(durationScore * 0.4 + (reliabilityScore - retryPenalty) * 0.4 + scoreLow(a11yPenalty, 0, 10) * 0.2, 0, 100),
      );
      return { ...t, benchmarkScore, benchmarkTier: tier(benchmarkScore), accessibility: a11y };
    });

    // ── Summary ─────────────────────────────────────────────────────────
    const durations = enriched.map((t) => t.duration);
    const passed = enriched.filter((t) => t.status === 'passed').length;
    const failed = enriched.filter((t) => ['failed', 'timedOut'].includes(t.status)).length;
    const skipped = enriched.filter((t) => t.status === 'skipped').length;
    const timedOut = enriched.filter((t) => t.status === 'timedOut').length;
    const flaky = enriched.filter((t) => t.retry > 0 && t.status === 'passed').length;
    const total = enriched.length;
    const passRate = total > 0 ? round((passed / total) * 100) : 0;
    const avgD = round(avg(durations));
    const medD = round(median(durations));
    const p95D = round(pctl(durations, 95));
    const p99D = round(pctl(durations, 99));
    const throughput = duration > 0 ? round(total / (duration / 60000)) : 0;
    const overallScore = round(
      scoreLow(avgD, 2000, 10000) * 0.3 + scoreHigh(passRate, 50, 100) * 0.35 +
        scoreLow(failed, 0, Math.max(total * 0.3, 1)) * 0.2 + scoreHigh(throughput, 2, 20) * 0.15,
    );

    // ── Observability aggregate ──────────────────────────────────────────
    const totalRequests = enriched.reduce((s, t) => s + t.observability.requestCount, 0);
    const reqFailures = enriched.reduce((s, t) => s + t.observability.requestFailureCount, 0);
    const respErrors = enriched.reduce((s, t) => s + t.observability.responseErrorCount, 0);
    const avgRespTimes = enriched.filter((t) => t.observability.avgResponseTimeMs > 0).map((t) => t.observability.avgResponseTimeMs);
    const p95RespTimes = enriched.filter((t) => t.observability.p95ResponseTimeMs > 0).map((t) => t.observability.p95ResponseTimeMs);
    const maxRespTimes = enriched.filter((t) => t.observability.maxResponseTimeMs > 0).map((t) => t.observability.maxResponseTimeMs);
    const allConsoleErrors: string[] = [];
    const allPageErrors: string[] = [];
    for (const t of enriched) {
      allConsoleErrors.push(...t.observability.consoleErrors);
      allPageErrors.push(...t.observability.pageErrors);
    }
    const obsAvgResp = round(avg(avgRespTimes));
    const obsP95Resp = round(p95RespTimes.length > 0 ? Math.max(...p95RespTimes) : 0);
    const obsMaxResp = round(maxRespTimes.length > 0 ? Math.max(...maxRespTimes) : 0);
    const reqFailRate = totalRequests > 0 ? round((reqFailures / totalRequests) * 100) : 0;

    // Network health score (lower failure rate = higher score)
    const networkScore = round(clamp(
      scoreLow(reqFailRate, 0, 10) * 0.4 + scoreLow(obsAvgResp, 200, 2000) * 0.3 + scoreLow(respErrors, 0, Math.max(totalRequests * 0.1, 1)) * 0.3,
      0, 100,
    ));
    // Error score (fewer errors = higher score)
    const errorScore = round(clamp(
      scoreLow(allConsoleErrors.length, 0, 10) * 0.5 + scoreLow(allPageErrors.length, 0, 5) * 0.5,
      0, 100,
    ));
    const observabilityScore = round(networkScore * 0.6 + errorScore * 0.4);

    // ── Security analysis ────────────────────────────────────────────────
    const findings: { severity: string; category: string; description: string; count: number }[] = [];
    if (reqFailures > 0) {
      findings.push({
        severity: reqFailures > 5 ? 'high' : 'medium',
        category: 'Network Failures',
        description: `${reqFailures} network-level request failure(s) detected (DNS, TLS, connection errors)`,
        count: reqFailures,
      });
    }
    if (respErrors > 0) {
      findings.push({
        severity: respErrors > 10 ? 'high' : 'medium',
        category: 'HTTP Errors',
        description: `${respErrors} HTTP response(s) with status 4xx/5xx detected`,
        count: respErrors,
      });
    }
    if (allConsoleErrors.length > 0) {
      // Deduplicate console errors
      const uniqueConsole = [...new Set(allConsoleErrors)];
      findings.push({
        severity: uniqueConsole.length > 5 ? 'high' : 'low',
        category: 'Console Errors',
        description: `${allConsoleErrors.length} console error(s) captured (${uniqueConsole.length} unique)`,
        count: allConsoleErrors.length,
      });
    }
    if (allPageErrors.length > 0) {
      findings.push({
        severity: 'high',
        category: 'Unhandled Page Errors',
        description: `${allPageErrors.length} unhandled JavaScript error(s) (window.onerror)`,
        count: allPageErrors.length,
      });
    }
    if (failed > 0) {
      findings.push({
        severity: failed > 3 ? 'critical' : 'high',
        category: 'Test Failures',
        description: `${failed} test(s) failed — may indicate broken functionality or regressions`,
        count: failed,
      });
    }
    if (flaky > 0) {
      findings.push({
        severity: 'medium',
        category: 'Flaky Tests',
        description: `${flaky} test(s) passed only after retry — indicates instability`,
        count: flaky,
      });
    }
    if (obsAvgResp > 500) {
      findings.push({
        severity: obsAvgResp > 1000 ? 'high' : 'medium',
        category: 'Slow Responses',
        description: `Average API response time is ${obsAvgResp}ms (target: <200ms)`,
        count: 1,
      });
    }
    if (obsP95Resp > 1000) {
      findings.push({
        severity: 'medium',
        category: 'P95 Latency',
        description: `P95 response time is ${obsP95Resp}ms — tail latency may impact user experience`,
        count: 1,
      });
    }

    const securityScore = round(clamp(
      observabilityScore * 0.3 + scoreHigh(passRate, 50, 100) * 0.3 +
      scoreLow(findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length, 0, 5) * 0.4,
      0, 100,
    ));

    // ── Accessibility aggregate ──────────────────────────────────────────
    const allA11y = enriched.map((t) => t.accessibility);
    const a11yTotal = allA11y.reduce((s, a) => s + a.totalViolations, 0);
    const a11yCrit = allA11y.reduce((s, a) => s + a.critical, 0);
    const a11ySer = allA11y.reduce((s, a) => s + a.serious, 0);
    const a11yMod = allA11y.reduce((s, a) => s + a.moderate, 0);
    const a11yMin = allA11y.reduce((s, a) => s + a.minor, 0);
    const testsWithViolations = allA11y.filter((a) => a.totalViolations > 0).length;
    const a11yPenalty = a11yCrit * 4 + a11ySer * 3 + a11yMod * 2 + a11yMin;
    const a11yScore = round(clamp(100 - a11yPenalty * 5, 0, 100));
    const vMap = new Map<string, { id: string; impact: string; description: string; count: number }>();
    for (const a of allA11y) for (const v of a.violations) {
      const e = vMap.get(v.id);
      if (e) e.count += v.nodes; else vMap.set(v.id, { ...v, count: v.nodes });
    }
    const topViolations = [...vMap.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    // ── Browser breakdown ────────────────────────────────────────────────
    const browserMap = new Map<string, UTestEnriched[]>();
    for (const t of enriched) { const l = browserMap.get(t.browser) || []; l.push(t); browserMap.set(t.browser, l); }
    const browsers: UBrowserRow[] = [...browserMap.entries()].map(([browser, list]) => {
      const d = list.map((t) => t.duration);
      const p = list.filter((t) => t.status === 'passed').length;
      const f = list.filter((t) => ['failed', 'timedOut'].includes(t.status)).length;
      const pr = list.length > 0 ? round((p / list.length) * 100) : 0;
      const bs = round(avg(list.map((t) => t.benchmarkScore)));
      return {
        browser, total: list.length, passed: p, failed: f,
        avgDuration: round(avg(d)), medianDuration: round(median(d)), p95Duration: round(pctl(d, 95)),
        passRate: pr, benchmarkScore: bs, tier: tier(bs),
        a11yViolations: list.reduce((s, t) => s + t.accessibility.totalViolations, 0),
        totalRequests: list.reduce((s, t) => s + t.observability.requestCount, 0),
        requestFailures: list.reduce((s, t) => s + t.observability.requestFailureCount, 0),
        avgResponseTime: round(avg(list.filter((t) => t.observability.avgResponseTimeMs > 0).map((t) => t.observability.avgResponseTimeMs))),
      };
    }).sort((a, b) => b.benchmarkScore - a.benchmarkScore);

    // ── File breakdown ───────────────────────────────────────────────────
    const fileMap = new Map<string, UTestEnriched[]>();
    for (const t of enriched) { const l = fileMap.get(t.file) || []; l.push(t); fileMap.set(t.file, l); }
    const fileBreakdown = [...fileMap.entries()].map(([file, list]) => ({
      file, total: list.length,
      passed: list.filter((t) => t.status === 'passed').length,
      failed: list.filter((t) => ['failed', 'timedOut'].includes(t.status)).length,
      avgDuration: round(avg(list.map((t) => t.duration))),
    }));

    let pwVersion = 'unknown';
    try { pwVersion = require('@playwright/test/package.json').version; } catch { /* */ }

    return {
      generatedAt: new Date().toISOString(),
      duration,
      workers: this.config?.workers || 1,
      rootDir: process.cwd().split(path.sep).join('/'),
      platform: `${os.platform()} ${os.arch()} (${os.release()})`,
      nodeVersion: process.version,
      playwrightVersion: pwVersion,
      summary: {
        total, passed, failed, skipped, timedOut, flaky, passRate,
        avgDuration: avgD, medianDuration: medD, p95Duration: p95D, p99Duration: p99D,
        throughputPerMin: throughput, benchmarkScore: overallScore, benchmarkTier: tier(overallScore),
      },
      observability: {
        totalRequests, requestFailures: reqFailures, requestFailureRate: reqFailRate,
        responseErrors: respErrors, avgResponseTimeMs: obsAvgResp, p95ResponseTimeMs: obsP95Resp,
        maxResponseTimeMs: obsMaxResp, totalConsoleErrors: allConsoleErrors.length,
        totalPageErrors: allPageErrors.length,
        consoleErrors: [...new Set(allConsoleErrors)].slice(0, 50),
        pageErrors: [...new Set(allPageErrors)].slice(0, 50),
        networkScore, errorScore, observabilityScore,
      },
      security: {
        httpErrorCount: respErrors, networkFailureCount: reqFailures,
        consoleErrorCount: allConsoleErrors.length, pageErrorCount: allPageErrors.length,
        securityScore, riskLevel: riskLevel(securityScore),
        findings: findings.sort((a, b) => {
          const ord: any = { critical: 0, high: 1, medium: 2, low: 3 };
          return (ord[a.severity] ?? 4) - (ord[b.severity] ?? 4);
        }),
      },
      accessibility: {
        totalViolations: a11yTotal, critical: a11yCrit, serious: a11ySer, moderate: a11yMod, minor: a11yMin,
        score: a11yScore, testsScanned: total, testsWithViolations, topViolations,
      },
      browsers,
      tests: enriched.sort((a, b) => b.duration - a.duration),
      fileBreakdown,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   *  HTML GENERATION — single self-contained HTML with Plotly CDN
   *
   *  This method generates the ENTIRE HTML report as a single string.
   *  The report includes:
   *    - CSS styles (dark theme, responsive grid, KPI cards)
   *    - HTML structure (7 tabs with charts, tables, test cards)
   *    - JavaScript (tab switching, search/filter, chart rendering)
   *    - Plotly.js loaded from CDN for interactive charts
   *    - The payload JSON embedded as a <script> variable
   *
   *  The report is fully self-contained — open it in any browser,
   *  even offline (except for Plotly.js CDN dependency).
   * ═══════════════════════════════════════════════════════════════════════ */

  private buildHtml(P: UPayload): string {
    const safeJSON = JSON.stringify(P).replace(/<\//g, '\\u003c/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Universal Test Report</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"><\/script>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f172a;--surface:#1e293b;--surface2:#334155;--ink:#e2e8f0;--muted:#94a3b8;
  --accent:#6366f1;--green:#22c55e;--green-s:#052e16;--red:#ef4444;--red-s:#450a0a;
  --amber:#f59e0b;--amber-s:#451a03;--blue:#3b82f6;--purple:#a855f7;--cyan:#06b6d4;
  --border:#334155;--radius:10px;--shadow:0 4px 12px rgba(0,0,0,.4);
}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1480px;margin:0 auto;padding:20px}
a{color:var(--accent);text-decoration:none}
.hdr{background:linear-gradient(135deg,#1e1b4b,#312e81,#4338ca);border-radius:var(--radius);padding:28px 32px;margin-bottom:20px;box-shadow:var(--shadow)}
.hdr h1{font-size:1.6rem;font-weight:800;color:#fff;margin-bottom:6px}
.hdr .meta{display:flex;flex-wrap:wrap;gap:18px;font-size:.82rem;color:rgba(255,255,255,.7)}
.hdr .meta b{color:#fff}
.tabs{display:flex;gap:4px;margin-bottom:20px;border-bottom:2px solid var(--border);padding-bottom:0;overflow-x:auto}
.tab{padding:10px 20px;cursor:pointer;font-weight:600;font-size:.85rem;border-radius:var(--radius) var(--radius) 0 0;color:var(--muted);transition:.15s;white-space:nowrap}
.tab:hover{background:var(--surface);color:var(--ink)}
.tab.active{background:var(--accent);color:#fff}
.tab-content{display:none} .tab-content.active{display:block}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px;margin-bottom:20px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px;transition:.15s}
.kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.kpi-lbl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px}
.kpi-val{font-size:1.7rem;font-weight:800;line-height:1.2}
.kpi-sub{font-size:.75rem;color:var(--muted);margin-top:3px}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.b-pass{background:var(--green-s);color:var(--green)} .b-fail{background:var(--red-s);color:var(--red)}
.b-skip{background:var(--amber-s);color:var(--amber)} .b-timed{background:var(--red-s);color:var(--red)}
.b-elite{background:#052e16;color:#22c55e} .b-strong{background:#172554;color:#3b82f6}
.b-stable{background:#451a03;color:#f59e0b} .b-watch{background:#431407;color:#f97316}
.b-critical{background:#450a0a;color:#ef4444}
.b-low{background:#052e16;color:#22c55e} .b-medium{background:#451a03;color:#f59e0b}
.b-high{background:#431407;color:#f97316}
.grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:14px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:14px}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
.panel h3{font-size:.88rem;font-weight:700;margin-bottom:10px;color:#fff}
.panel .help{font-size:.75rem;color:var(--muted);margin-bottom:8px}
.chart{width:100%;height:320px} .chart-lg{width:100%;height:380px}
.tbl-wrap{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow-x:auto;margin-bottom:14px;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:.82rem}
th,td{padding:9px 13px;text-align:left;border-bottom:1px solid var(--border)}
th{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:#0f172a;position:sticky;top:0;z-index:1}
tr:hover td{background:rgba(255,255,255,.03)}
td.r{text-align:right;font-variant-numeric:tabular-nums}
.test-item{background:var(--surface);margin-bottom:8px;border-radius:var(--radius);overflow:hidden;border-left:4px solid var(--border)}
.test-item.passed{border-left-color:var(--green)} .test-item.failed,.test-item.timedOut{border-left-color:var(--red)}
.test-item.skipped{border-left-color:var(--amber)}
.t-hdr{padding:13px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none}
.t-hdr:hover{background:rgba(255,255,255,.02)}
.t-title{font-weight:600;font-size:.88rem;flex:1;margin-right:12px;word-break:break-word}
.t-meta{display:flex;gap:12px;align-items:center;font-size:.8rem;color:var(--muted);flex-shrink:0}
.t-body{display:none;padding:16px;border-top:1px solid var(--border);animation:fadeIn .2s}
.t-body.open{display:block}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.step{padding:3px 0 3px 14px;border-left:2px solid var(--border);font-family:ui-monospace,SFMono-Regular,monospace;font-size:.78rem;color:var(--muted)}
.step.fail{border-left-color:var(--red);color:#fca5a5}
.err-block{background:var(--red-s);color:#fca5a5;padding:12px;border-radius:6px;font-size:.82rem;margin-bottom:10px;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;font-family:ui-monospace,monospace}
.ss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:12px}
.ss-card{background:#0f172a;border-radius:6px;overflow:hidden;text-align:center}
.ss-card img{max-width:100%;cursor:zoom-in;display:block}
.ss-card .lbl{font-size:.72rem;padding:6px;color:var(--muted)}
.controls{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.search{flex:1;min-width:200px;padding:9px 14px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:.85rem;outline:none}
.search:focus{border-color:var(--accent)}
.fbtn{padding:8px 16px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:.8rem;font-weight:600;cursor:pointer;transition:.15s}
.fbtn:hover,.fbtn.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.viol-item{display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border)}
.viol-item:last-child{border-bottom:none}
.viol-cnt{font-size:1.1rem;font-weight:800;min-width:32px;text-align:center}
.viol-info{flex:1} .viol-info .vid{font-weight:700;font-size:.82rem} .viol-info .vdesc{font-size:.75rem;color:var(--muted)}
.finding{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:8px;border-left:4px solid var(--border)}
.finding.critical{border-left-color:var(--red)} .finding.high{border-left-color:#f97316}
.finding.medium{border-left-color:var(--amber)} .finding.low{border-left-color:var(--blue)}
.finding .f-cat{font-weight:700;font-size:.85rem;margin-bottom:3px}
.finding .f-desc{font-size:.8rem;color:var(--muted)}
.obs-inset{margin-top:10px;background:rgba(6,182,212,.06);border:1px solid rgba(6,182,212,.3);border-radius:6px;padding:12px}
.obs-inset .obs-title{color:var(--cyan);font-weight:700;font-size:.82rem;margin-bottom:6px}
.obs-row{display:flex;flex-wrap:wrap;gap:14px;font-size:.78rem;color:var(--muted)}
.obs-row b{color:var(--ink)}
.log-block{background:#0f172a;color:var(--muted);padding:10px;border-radius:6px;font-family:ui-monospace,monospace;font-size:.75rem;max-height:200px;overflow-y:auto;margin-top:6px;white-space:pre-wrap;word-break:break-word}
.lightbox{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.92);z-index:9999;display:none;align-items:center;justify-content:center;cursor:zoom-out}
.lightbox.show{display:flex}
.lightbox img{max-width:95%;max-height:95%;border-radius:8px}
@media(max-width:900px){.grid-2,.grid-3{grid-template-columns:1fr} .kpi-row{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.wrap{padding:10px} .kpi-row{grid-template-columns:1fr}}
@media print{body{background:#fff;color:#000} .hdr{-webkit-print-color-adjust:exact} .panel,.kpi,.test-item,.tbl-wrap,.finding{break-inside:avoid}}
</style>
</head>
<body>
<div class="wrap">

<header class="hdr">
  <h1>📊 Universal Test Report</h1>
  <div class="meta">
    <span>Generated: <b id="hGenAt"></b></span>
    <span>Duration: <b id="hDur"></b></span>
    <span>Tests: <b id="hTotal"></b></span>
    <span>Pass Rate: <b id="hPR"></b></span>
    <span>Platform: <b id="hPlat"></b></span>
    <span>Playwright: <b id="hPW"></b></span>
  </div>
</header>

<div class="tabs" id="tabs">
  <div class="tab active" data-tab="dashboard">📈 Dashboard</div>
  <div class="tab" data-tab="tests">🧪 Tests</div>
  <div class="tab" data-tab="perf">⚡ Performance</div>
  <div class="tab" data-tab="obs">🔭 Observability</div>
  <div class="tab" data-tab="sec">🔒 Security</div>
  <div class="tab" data-tab="a11y">♿ Accessibility</div>
  <div class="tab" data-tab="browsers">🌐 Browsers</div>
</div>

<!-- ═══ DASHBOARD ═══ -->
<div class="tab-content active" id="tab-dashboard">
  <div class="kpi-row" id="kpiRow"></div>
  <div class="grid-2">
    <div class="panel"><h3>Test Results</h3><div id="cDonut" class="chart"></div></div>
    <div class="panel"><h3>Duration by Test (Top 20)</h3><div id="cBar" class="chart"></div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><h3>Results by File</h3><div id="cFileBar" class="chart"></div></div>
    <div class="panel"><h3>Benchmark Tier Distribution</h3><div id="cTierPie" class="chart"></div></div>
  </div>
</div>

<!-- ═══ TESTS ═══ -->
<div class="tab-content" id="tab-tests">
  <div class="controls">
    <input class="search" id="searchBox" placeholder="🔍 Search tests by name, file, browser …" />
    <button class="fbtn on" data-filter="all">All</button>
    <button class="fbtn" data-filter="passed">✅ Passed</button>
    <button class="fbtn" data-filter="failed">❌ Failed</button>
    <button class="fbtn" data-filter="skipped">⏭ Skipped</button>
  </div>
  <div id="testList"></div>
</div>

<!-- ═══ PERFORMANCE ═══ -->
<div class="tab-content" id="tab-perf">
  <div class="kpi-row" id="perfKpi"></div>
  <div class="grid-2">
    <div class="panel"><h3>3D Benchmark Cloud</h3><p class="help">Each dot = 1 test. X=Duration, Y=Score, Z=Retry. Drag to rotate.</p><div id="c3d" class="chart-lg"></div></div>
    <div class="panel"><h3>Duration Distribution (Box Plot)</h3><p class="help">Box plot per browser showing spread and outliers.</p><div id="cBox" class="chart-lg"></div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><h3>Top 10 Slowest Tests</h3><div id="cSlow" class="chart"></div></div>
    <div class="panel"><h3>Duration Histogram</h3><div id="cHist" class="chart"></div></div>
  </div>
  <div class="tbl-wrap"><table id="perfTable"><thead><tr><th>#</th><th>Test</th><th>Browser</th><th>Duration</th><th>Requests</th><th>Avg Resp</th><th>Score</th><th>Tier</th><th>Status</th></tr></thead><tbody id="perfTbody"></tbody></table></div>
</div>

<!-- ═══ OBSERVABILITY ═══ -->
<div class="tab-content" id="tab-obs">
  <div class="kpi-row" id="obsKpi"></div>
  <div class="grid-2">
    <div class="panel"><h3>Network Requests per Test</h3><div id="cNetBar" class="chart"></div></div>
    <div class="panel"><h3>Response Time Distribution</h3><div id="cRespBox" class="chart"></div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><h3>Requests vs Response Time</h3><p class="help">Bubble size = request count. Color = status.</p><div id="cNetBubble" class="chart-lg"></div></div>
    <div class="panel"><h3>Error Distribution per Test</h3><div id="cErrBar" class="chart-lg"></div></div>
  </div>
  <div class="grid-2">
    <div class="panel"><h3>Console Errors</h3><div id="consoleErrList" style="max-height:320px;overflow-y:auto"></div></div>
    <div class="panel"><h3>Page Errors (Unhandled Exceptions)</h3><div id="pageErrList" style="max-height:320px;overflow-y:auto"></div></div>
  </div>
  <div class="tbl-wrap"><table id="obsTable"><thead><tr><th>#</th><th>Test</th><th>Browser</th><th>Requests</th><th>Failures</th><th>HTTP Errors</th><th>Avg Resp</th><th>P95 Resp</th><th>Console Errs</th><th>Page Errs</th></tr></thead><tbody id="obsTbody"></tbody></table></div>
</div>

<!-- ═══ SECURITY ═══ -->
<div class="tab-content" id="tab-sec">
  <div class="kpi-row" id="secKpi"></div>
  <div class="grid-2">
    <div class="panel"><h3>Security Posture Radar</h3><div id="cSecRadar" class="chart-lg"></div></div>
    <div class="panel"><h3>Findings by Severity</h3><div id="cSecPie" class="chart-lg"></div></div>
  </div>
  <div style="margin-bottom:14px"><h3 style="color:#fff;margin-bottom:12px;font-size:.95rem">🔍 Security Findings</h3><div id="findingsList"></div></div>
  <div class="tbl-wrap"><table id="secTable"><thead><tr><th>Severity</th><th>Category</th><th>Description</th><th>Count</th></tr></thead><tbody id="secTbody"></tbody></table></div>
</div>

<!-- ═══ ACCESSIBILITY ═══ -->
<div class="tab-content" id="tab-a11y">
  <div class="kpi-row" id="a11yKpi"></div>
  <div class="grid-2">
    <div class="panel"><h3>Violations by Severity</h3><div id="cA11yPie" class="chart"></div></div>
    <div class="panel"><h3>Top Violations</h3><div id="violList" style="max-height:320px;overflow-y:auto"></div></div>
  </div>
</div>

<!-- ═══ BROWSERS ═══ -->
<div class="tab-content" id="tab-browsers">
  <div class="grid-2">
    <div class="panel"><h3>Browser Radar</h3><div id="cRadar" class="chart-lg"></div></div>
    <div class="panel"><h3>Pass Rate vs Benchmark Score</h3><div id="cBrowserBar" class="chart-lg"></div></div>
  </div>
  <div class="tbl-wrap"><table id="browserTable"></table></div>
</div>

<div class="lightbox" id="lightbox" onclick="this.classList.remove('show')"><img id="lbImg"/></div>
</div>

<script>
var D=${safeJSON};
var S=D.summary,A=D.accessibility,B=D.browsers,T=D.tests,O=D.observability,Sec=D.security;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmt(ms){if(ms>=60000)return(ms/60000).toFixed(1)+'m';if(ms>=1000)return(ms/1000).toFixed(2)+'s';return Math.round(ms)+'ms'}
function tierBadge(t){return'<span class="badge b-'+t.toLowerCase()+'">'+t+'<\\/span>'}
function statusBadge(s){var m={passed:'b-pass',failed:'b-fail',timedOut:'b-timed',skipped:'b-skip',interrupted:'b-fail'};return'<span class="badge '+(m[s]||'')+'">'+(s==='timedOut'?'TIMED OUT':s.toUpperCase())+'<\\/span>'}
function sevBadge(s){return'<span class="badge b-'+(s==='critical'?'critical':s)+'" style="'+(s==='critical'?'background:var(--red-s);color:var(--red)':'')+'">'+s.toUpperCase()+'<\\/span>'}
function kpi(l,v,sub,c){return'<div class="kpi"><div class="kpi-lbl">'+l+'<\\/div><div class="kpi-val"'+(c?' style="color:'+c+'"':'')+ '>'+v+'<\\/div>'+(sub?'<div class="kpi-sub">'+sub+'<\\/div>':'')+'<\\/div>'}
var PC={responsive:true,displaylogo:false,displayModeBar:false};
var DL={paper_bgcolor:'rgba(0,0,0,0)',plot_bgcolor:'rgba(0,0,0,0)',font:{family:'-apple-system,sans-serif',color:'#e2e8f0',size:11},margin:{l:45,r:15,t:10,b:45}};
var TC={Elite:'#22c55e',Strong:'#3b82f6',Stable:'#f59e0b',Watch:'#f97316',Critical:'#ef4444'};
var SC={passed:'#22c55e',failed:'#ef4444',timedOut:'#f97316',skipped:'#f59e0b',interrupted:'#ef4444'};

document.getElementById('hGenAt').textContent=new Date(D.generatedAt).toLocaleString();
document.getElementById('hDur').textContent=fmt(D.duration);
document.getElementById('hTotal').textContent=S.total;
document.getElementById('hPR').textContent=S.passRate+'%';
document.getElementById('hPlat').textContent=D.platform;
document.getElementById('hPW').textContent=D.playwrightVersion;

document.querySelectorAll('.tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});
    document.querySelectorAll('.tab-content').forEach(function(c){c.classList.remove('active')});
    tab.classList.add('active');
    document.getElementById('tab-'+tab.dataset.tab).classList.add('active');
    window.dispatchEvent(new Event('resize'));
  });
});

/* ═══ DASHBOARD ═══ */
document.getElementById('kpiRow').innerHTML=[
  kpi('Benchmark',S.benchmarkScore+'/100',tierBadge(S.benchmarkTier)),
  kpi('Pass Rate',S.passRate+'%','',S.passRate>=90?'var(--green)':S.passRate>=70?'var(--amber)':'var(--red)'),
  kpi('Total Tests',S.total,S.passed+' pass, '+S.failed+' fail'),
  kpi('Median Duration',fmt(S.medianDuration),'P95: '+fmt(S.p95Duration)),
  kpi('Network',O.totalRequests+' req',O.requestFailures+' failures',O.requestFailures===0?'var(--green)':'var(--red)'),
  kpi('Observability',O.observabilityScore+'/100','net '+O.networkScore+' | err '+O.errorScore,O.observabilityScore>=80?'var(--green)':O.observabilityScore>=50?'var(--amber)':'var(--red)'),
  kpi('Security',Sec.securityScore+'/100','Risk: '+Sec.riskLevel,Sec.securityScore>=80?'var(--green)':Sec.securityScore>=50?'var(--amber)':'var(--red)'),
  kpi('A11y',A.score+'/100',A.totalViolations+' violations',A.score>=90?'var(--green)':A.score>=60?'var(--amber)':'var(--red)')
].join('');

Plotly.newPlot('cDonut',[{type:'pie',labels:['Passed','Failed','Skipped','Timed Out'],values:[S.passed,S.failed,S.skipped,S.timedOut],hole:.55,marker:{colors:['#22c55e','#ef4444','#f59e0b','#f97316']},textinfo:'label+value',textfont:{size:11}}],Object.assign({},DL,{margin:{l:0,r:0,t:0,b:0},showlegend:true,legend:{font:{color:'#e2e8f0'}}}),PC);

var top20=T.slice().sort(function(a,b){return b.duration-a.duration}).slice(0,20);
Plotly.newPlot('cBar',[{type:'bar',orientation:'h',x:top20.map(function(t){return t.duration}),y:top20.map(function(t){return t.title.length>45?t.title.slice(0,42)+'...':t.title}),marker:{color:top20.map(function(t){return SC[t.status]||'#6366f1'})}}],Object.assign({},DL,{yaxis:{automargin:true},xaxis:{title:'Duration (ms)'}}),PC);

var fb=D.fileBreakdown;
Plotly.newPlot('cFileBar',[{type:'bar',name:'Passed',x:fb.map(function(f){return f.file.split('/').pop()}),y:fb.map(function(f){return f.passed}),marker:{color:'#22c55e'}},{type:'bar',name:'Failed',x:fb.map(function(f){return f.file.split('/').pop()}),y:fb.map(function(f){return f.failed}),marker:{color:'#ef4444'}}],Object.assign({},DL,{barmode:'stack',legend:{font:{color:'#e2e8f0'},orientation:'h',y:1.15}}),PC);

var tiers=['Elite','Strong','Stable','Watch','Critical'];
Plotly.newPlot('cTierPie',[{type:'pie',labels:tiers,values:tiers.map(function(t){return T.filter(function(x){return x.benchmarkTier===t}).length}),hole:.5,marker:{colors:tiers.map(function(t){return TC[t]})},textinfo:'label+percent',textfont:{size:11}}],Object.assign({},DL,{margin:{l:0,r:0,t:0,b:0}}),PC);

/* ═══ TESTS ═══ */
var curFilter='all',searchTerm='';
function renderSteps(st,l){if(!st||!st.length)return'';return st.map(function(s){var ic=s.status==='failed'?'❌':'▸';var cl=s.status==='failed'?' fail':'';var er=s.error?'<div style="color:#fca5a5;font-size:.75rem;margin-top:2px">'+esc(s.error)+'<\\/div>':'';return'<div class="step'+cl+'" style="margin-left:'+l*12+'px">'+ic+' '+esc(s.title)+' <span style="color:var(--muted)">('+fmt(s.duration)+')<\\/span>'+er+renderSteps(s.steps,l+1)+'<\\/div>'}).join('')}

function renderTests(){
  var list=T.filter(function(t){if(curFilter!=='all'&&t.status!==curFilter)return false;if(searchTerm){var s=searchTerm.toLowerCase();return(t.title+' '+t.file+' '+t.browser+' '+t.fullTitle).toLowerCase().indexOf(s)>=0}return true});
  var html=list.map(function(t){
    var errH=t.errors.length?'<div class="err-block">'+t.errors.map(esc).join('\\n')+'<\\/div>':'';
    var stH=renderSteps(t.steps,0);
    var imgs=t.attachments.filter(function(a){return a.base64&&a.contentType.startsWith('image/')});
    var ssH=imgs.length?'<div class="ss-grid">'+imgs.map(function(a){var src='data:'+a.contentType+';base64,'+a.base64;return'<div class="ss-card"><img src="'+src+'" onclick="showLB(this.src)" alt="'+esc(a.name)+'"/><div class="lbl">'+esc(a.name)+'<\\/div><\\/div>'}).join('')+'<\\/div>':'';
    var trH=t.attachments.filter(function(a){return a.name==='trace'&&a.path}).map(function(a){return'<div style="margin-top:8px"><a href="https://trace.playwright.dev" target="_blank">📦 View Trace<\\/a> <span style="color:var(--muted);font-size:.75rem">('+esc(a.path)+')<\\/span><\\/div>'}).join('');

    // Observability inset
    var ob=t.observability;
    var obsH='<div class="obs-inset"><div class="obs-title">🔭 Observability Metrics<\\/div><div class="obs-row"><span>Requests: <b>'+ob.requestCount+'<\\/b><\\/span><span>Failures: <b style="color:'+(ob.requestFailureCount>0?'var(--red)':'var(--green)')+'">'+ob.requestFailureCount+'<\\/b><\\/span><span>HTTP Errors: <b style="color:'+(ob.responseErrorCount>0?'var(--red)':'var(--green)')+'">'+ob.responseErrorCount+'<\\/b><\\/span><span>Avg Response: <b>'+ob.avgResponseTimeMs+'ms<\\/b><\\/span><span>P95: <b>'+ob.p95ResponseTimeMs+'ms<\\/b><\\/span><span>Console Errors: <b style="color:'+(ob.consoleErrors.length>0?'var(--amber)':'var(--green)')+'">'+ob.consoleErrors.length+'<\\/b><\\/span><span>Page Errors: <b style="color:'+(ob.pageErrors.length>0?'var(--red)':'var(--green)')+'">'+ob.pageErrors.length+'<\\/b><\\/span><\\/div>';
    if(ob.consoleErrors.length>0)obsH+='<div class="log-block"><b>Console Errors:<\\/b>\\n'+ob.consoleErrors.map(esc).join('\\n')+'<\\/div>';
    if(ob.pageErrors.length>0)obsH+='<div class="log-block" style="border-left:3px solid var(--red)"><b>Page Errors:<\\/b>\\n'+ob.pageErrors.map(esc).join('\\n')+'<\\/div>';
    obsH+='<\\/div>';

    // Accessibility inset
    var a11yH='';
    if(t.accessibility&&t.accessibility.totalViolations>0){
      var ic2={critical:'var(--red)',serious:'#f97316',moderate:'var(--amber)',minor:'var(--blue)'};
      var ib2={critical:'var(--red-s)',serious:'var(--amber-s)',moderate:'#451a03',minor:'#172554'};
      a11yH='<div style="margin-top:10px;background:rgba(168,85,247,.08);border:1px solid #7c3aed;border-radius:6px;padding:12px"><div style="color:#d8b4fe;font-weight:700;margin-bottom:6px">♿ Accessibility: '+t.accessibility.totalViolations+' violations<\\/div>'+t.accessibility.violations.map(function(v){return'<div style="font-size:.8rem;padding:3px 0"><span class="badge" style="background:'+(ib2[v.impact]||'#333')+';color:'+(ic2[v.impact]||'#999')+'">'+v.impact+'<\\/span> <b>'+esc(v.id)+'<\\/b> — '+esc(v.description)+' ('+v.nodes+' nodes)<\\/div>'}).join('')+'<\\/div>';
    }

    return'<div class="test-item '+t.status+'"><div class="t-hdr" onclick="toggleT(\\''+t.id+'\\')"><div class="t-title">'+esc(t.title)+' <span style="color:var(--muted);font-size:.78rem">'+esc(t.file)+'<\\/span><\\/div><div class="t-meta"><span>'+fmt(t.duration)+'<\\/span><span>'+esc(t.browser)+'<\\/span>'+statusBadge(t.status)+tierBadge(t.benchmarkTier)+'<\\/div><\\/div><div class="t-body" id="tb-'+t.id+'">'+errH+'<div style="background:#0f172a;padding:12px;border-radius:6px;margin-bottom:8px"><b style="font-size:.8rem">Steps:<\\/b>'+stH+'<\\/div>'+ssH+trH+obsH+a11yH+'<\\/div><\\/div>';
  }).join('');
  document.getElementById('testList').innerHTML=html||'<div style="padding:40px;text-align:center;color:var(--muted)">No tests match current filter.<\\/div>';
}
function toggleT(id){var el=document.getElementById('tb-'+id);if(el)el.classList.toggle('open')}
function showLB(src){document.getElementById('lbImg').src=src;document.getElementById('lightbox').classList.add('show')}
document.querySelectorAll('.fbtn').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.fbtn').forEach(function(b){b.classList.remove('on')});btn.classList.add('on');curFilter=btn.dataset.filter;renderTests()})});
document.getElementById('searchBox').addEventListener('input',function(e){searchTerm=e.target.value;renderTests()});
renderTests();

/* ═══ PERFORMANCE ═══ */
document.getElementById('perfKpi').innerHTML=[kpi('Avg Duration',fmt(S.avgDuration)),kpi('Median',fmt(S.medianDuration)),kpi('P95',fmt(S.p95Duration)),kpi('P99',fmt(S.p99Duration)),kpi('Throughput',S.throughputPerMin+'/min'),kpi('Benchmark',S.benchmarkScore+'/100',tierBadge(S.benchmarkTier))].join('');

Plotly.newPlot('c3d',[{type:'scatter3d',mode:'markers',x:T.map(function(t){return t.duration}),y:T.map(function(t){return t.benchmarkScore}),z:T.map(function(t){return t.retry}),text:T.map(function(t){return esc(t.title)+'<br>Browser: '+t.browser+'<br>Status: '+t.status+'<br>Score: '+t.benchmarkScore}),marker:{size:T.map(function(t){return Math.max(5,Math.min(14,4+t.errors.length*2))}),color:T.map(function(t){return SC[t.status]||'#6366f1'}),opacity:.85,line:{width:.5,color:'#1e1b4b'}},hovertemplate:'%{text}<br>Duration: %{x}ms<extra><\\/extra>'}],Object.assign({},DL,{margin:{l:0,r:0,t:8,b:0},scene:{xaxis:{title:'Duration (ms)',gridcolor:'#334155'},yaxis:{title:'Score',gridcolor:'#334155',range:[0,100]},zaxis:{title:'Retry',gridcolor:'#334155'},bgcolor:'rgba(0,0,0,0)'}}),PC);

var byB={};T.forEach(function(t){if(!byB[t.browser])byB[t.browser]=[];byB[t.browser].push(t.duration)});
Plotly.newPlot('cBox',Object.keys(byB).map(function(k){return{type:'box',name:k,y:byB[k],boxpoints:'all',jitter:.3,pointpos:0,marker:{opacity:.5,size:4}}}),Object.assign({},DL,{yaxis:{title:'Duration (ms)',gridcolor:'#334155'}}),PC);

var slow=T.slice().sort(function(a,b){return b.duration-a.duration}).slice(0,10).reverse();
Plotly.newPlot('cSlow',[{type:'bar',orientation:'h',y:slow.map(function(t){return t.title.length>55?t.title.slice(0,52)+'...':t.title}),x:slow.map(function(t){return t.duration}),marker:{color:slow.map(function(t){return TC[t.benchmarkTier]||'#6366f1'})}}],Object.assign({},DL,{yaxis:{automargin:true},xaxis:{title:'Duration (ms)'}}),PC);

Plotly.newPlot('cHist',[{type:'histogram',x:T.map(function(t){return t.duration}),marker:{color:'#6366f1'},nbinsx:20}],Object.assign({},DL,{xaxis:{title:'Duration (ms)'},yaxis:{title:'Count'}}),PC);

document.getElementById('perfTbody').innerHTML=T.slice().sort(function(a,b){return b.duration-a.duration}).map(function(t,i){return'<tr><td class="r">'+(i+1)+'<\\/td><td>'+esc(t.title)+'<\\/td><td>'+esc(t.browser)+'<\\/td><td class="r">'+fmt(t.duration)+'<\\/td><td class="r">'+t.observability.requestCount+'<\\/td><td class="r">'+t.observability.avgResponseTimeMs+'ms<\\/td><td class="r"><b>'+t.benchmarkScore+'<\\/b><\\/td><td>'+tierBadge(t.benchmarkTier)+'<\\/td><td>'+statusBadge(t.status)+'<\\/td><\\/tr>'}).join('');

/* ═══ OBSERVABILITY ═══ */
document.getElementById('obsKpi').innerHTML=[
  kpi('Total Requests',O.totalRequests),
  kpi('Req Failures',O.requestFailures,''+O.requestFailureRate+'% rate',O.requestFailures===0?'var(--green)':'var(--red)'),
  kpi('HTTP Errors',O.responseErrors,'4xx/5xx responses',O.responseErrors===0?'var(--green)':'var(--red)'),
  kpi('Avg Response',O.avgResponseTimeMs+'ms','',O.avgResponseTimeMs<300?'var(--green)':O.avgResponseTimeMs<800?'var(--amber)':'var(--red)'),
  kpi('P95 Response',O.p95ResponseTimeMs+'ms'),
  kpi('Max Response',O.maxResponseTimeMs+'ms'),
  kpi('Console Errors',O.totalConsoleErrors,'',O.totalConsoleErrors===0?'var(--green)':'var(--amber)'),
  kpi('Page Errors',O.totalPageErrors,'unhandled exceptions',O.totalPageErrors===0?'var(--green)':'var(--red)'),
  kpi('Network Score',O.networkScore+'/100','',O.networkScore>=80?'var(--green)':O.networkScore>=50?'var(--amber)':'var(--red)'),
  kpi('Observability',O.observabilityScore+'/100','',O.observabilityScore>=80?'var(--green)':O.observabilityScore>=50?'var(--amber)':'var(--red)')
].join('');

// Network requests bar per test
var sorted=T.slice().sort(function(a,b){return b.observability.requestCount-a.observability.requestCount}).slice(0,20);
Plotly.newPlot('cNetBar',[{type:'bar',orientation:'h',x:sorted.map(function(t){return t.observability.requestCount}),y:sorted.map(function(t){return t.title.length>40?t.title.slice(0,37)+'...':t.title}),marker:{color:sorted.map(function(t){return t.observability.requestFailureCount>0?'#ef4444':'#06b6d4'})},hovertemplate:'%{y}<br>%{x} requests<extra><\\/extra>'}],Object.assign({},DL,{yaxis:{automargin:true},xaxis:{title:'Request Count'}}),PC);

// Response time box per browser
var rtByB={};T.forEach(function(t){if(t.observability.avgResponseTimeMs>0){if(!rtByB[t.browser])rtByB[t.browser]=[];rtByB[t.browser].push(t.observability.avgResponseTimeMs)}});
if(Object.keys(rtByB).length>0){Plotly.newPlot('cRespBox',Object.keys(rtByB).map(function(k){return{type:'box',name:k,y:rtByB[k],boxpoints:'all',jitter:.3,marker:{opacity:.5,size:4}}}),Object.assign({},DL,{yaxis:{title:'Avg Response Time (ms)',gridcolor:'#334155'}}),PC)}

// Bubble: requests vs response time
Plotly.newPlot('cNetBubble',[{type:'scatter',mode:'markers',x:T.map(function(t){return t.observability.requestCount}),y:T.map(function(t){return t.observability.avgResponseTimeMs}),text:T.map(function(t){return esc(t.title)+'<br>Browser: '+t.browser+'<br>Requests: '+t.observability.requestCount+'<br>Avg Resp: '+t.observability.avgResponseTimeMs+'ms'}),marker:{size:T.map(function(t){return Math.max(8,Math.min(30,t.observability.requestCount/2))}),color:T.map(function(t){return SC[t.status]||'#6366f1'}),opacity:.75},hovertemplate:'%{text}<extra><\\/extra>'}],Object.assign({},DL,{xaxis:{title:'Request Count',gridcolor:'#334155'},yaxis:{title:'Avg Response Time (ms)',gridcolor:'#334155'}}),PC);

// Error distribution bar
Plotly.newPlot('cErrBar',[
  {type:'bar',name:'Console Errors',x:T.map(function(t){return t.title.length>30?t.title.slice(0,27)+'...':t.title}),y:T.map(function(t){return t.observability.consoleErrors.length}),marker:{color:'#f59e0b'}},
  {type:'bar',name:'Page Errors',x:T.map(function(t){return t.title.length>30?t.title.slice(0,27)+'...':t.title}),y:T.map(function(t){return t.observability.pageErrors.length}),marker:{color:'#ef4444'}},
  {type:'bar',name:'HTTP Errors',x:T.map(function(t){return t.title.length>30?t.title.slice(0,27)+'...':t.title}),y:T.map(function(t){return t.observability.responseErrorCount}),marker:{color:'#f97316'}}
],Object.assign({},DL,{barmode:'stack',legend:{font:{color:'#e2e8f0'},orientation:'h',y:1.15},xaxis:{tickangle:-30}}),PC);

// Console errors list
var cel=document.getElementById('consoleErrList');
if(O.consoleErrors.length===0){cel.innerHTML='<div style="padding:30px;text-align:center;color:var(--green);font-weight:600">✅ No console errors captured<\\/div>'}
else{cel.innerHTML='<div class="log-block">'+O.consoleErrors.map(function(e,i){return'<div style="padding:4px 0;border-bottom:1px solid #334155"><span style="color:var(--amber);font-weight:700">#'+(i+1)+'<\\/span> '+esc(e)+'<\\/div>'}).join('')+'<\\/div>'}

// Page errors list
var pel=document.getElementById('pageErrList');
if(O.pageErrors.length===0){pel.innerHTML='<div style="padding:30px;text-align:center;color:var(--green);font-weight:600">✅ No unhandled page errors<\\/div>'}
else{pel.innerHTML='<div class="log-block" style="border-left:3px solid var(--red)">'+O.pageErrors.map(function(e,i){return'<div style="padding:4px 0;border-bottom:1px solid #334155"><span style="color:var(--red);font-weight:700">#'+(i+1)+'<\\/span> '+esc(e)+'<\\/div>'}).join('')+'<\\/div>'}

// Observability table
document.getElementById('obsTbody').innerHTML=T.slice().sort(function(a,b){return b.observability.requestCount-a.observability.requestCount}).map(function(t,i){var o=t.observability;return'<tr><td class="r">'+(i+1)+'<\\/td><td>'+esc(t.title)+'<\\/td><td>'+esc(t.browser)+'<\\/td><td class="r">'+o.requestCount+'<\\/td><td class="r" style="color:'+(o.requestFailureCount>0?'var(--red)':'')+'">'+o.requestFailureCount+'<\\/td><td class="r" style="color:'+(o.responseErrorCount>0?'var(--red)':'')+'">'+o.responseErrorCount+'<\\/td><td class="r">'+o.avgResponseTimeMs+'ms<\\/td><td class="r">'+o.p95ResponseTimeMs+'ms<\\/td><td class="r" style="color:'+(o.consoleErrors.length>0?'var(--amber)':'')+'">'+o.consoleErrors.length+'<\\/td><td class="r" style="color:'+(o.pageErrors.length>0?'var(--red)':'')+'">'+o.pageErrors.length+'<\\/td><\\/tr>'}).join('');

/* ═══ SECURITY ═══ */
document.getElementById('secKpi').innerHTML=[
  kpi('Security Score',Sec.securityScore+'/100','',Sec.securityScore>=80?'var(--green)':Sec.securityScore>=50?'var(--amber)':'var(--red)'),
  kpi('Risk Level',Sec.riskLevel,'',Sec.riskLevel==='Low'?'var(--green)':Sec.riskLevel==='Medium'?'var(--amber)':'var(--red)'),
  kpi('Findings',Sec.findings.length,'total issues',Sec.findings.length===0?'var(--green)':'var(--amber)'),
  kpi('HTTP Errors',Sec.httpErrorCount,'4xx/5xx',Sec.httpErrorCount===0?'var(--green)':'var(--red)'),
  kpi('Net Failures',Sec.networkFailureCount,'DNS/TLS/conn',Sec.networkFailureCount===0?'var(--green)':'var(--red)'),
  kpi('Console Errs',Sec.consoleErrorCount,'',Sec.consoleErrorCount===0?'var(--green)':'var(--amber)'),
  kpi('Page Errors',Sec.pageErrorCount,'unhandled JS',Sec.pageErrorCount===0?'var(--green)':'var(--red)'),
  kpi('Pass Rate',S.passRate+'%','',S.passRate>=90?'var(--green)':'var(--red)')
].join('');

// Security Radar
Plotly.newPlot('cSecRadar',[{type:'scatterpolar',fill:'toself',name:'Security Posture',
  r:[S.passRate,O.networkScore,O.errorScore,A.score,O.observabilityScore,S.passRate],
  theta:['Pass Rate','Network Health','Error Freedom','Accessibility','Observability','Pass Rate'],
  marker:{color:'#6366f1'},opacity:.7}],
  Object.assign({},DL,{polar:{radialaxis:{visible:true,range:[0,100],gridcolor:'#334155',color:'#94a3b8'},bgcolor:'rgba(0,0,0,0)',angularaxis:{color:'#94a3b8'}}}),PC);

// Findings pie
var sevCounts={critical:0,high:0,medium:0,low:0};
Sec.findings.forEach(function(f){sevCounts[f.severity]=(sevCounts[f.severity]||0)+1});
Plotly.newPlot('cSecPie',[{type:'pie',labels:['Critical','High','Medium','Low'],values:[sevCounts.critical,sevCounts.high,sevCounts.medium,sevCounts.low],hole:.55,marker:{colors:['#ef4444','#f97316','#f59e0b','#3b82f6']},textinfo:'label+value',textfont:{size:11}}],Object.assign({},DL,{margin:{l:0,r:0,t:0,b:0},annotations:[{text:Sec.findings.length+'<br>findings',showarrow:false,font:{size:16,color:'#e2e8f0'}}]}),PC);

// Findings list
var fl=document.getElementById('findingsList');
if(Sec.findings.length===0){fl.innerHTML='<div style="padding:30px;text-align:center;color:var(--green);font-weight:600;background:var(--surface);border-radius:var(--radius)">✅ No security findings — all clear!<\\/div>'}
else{fl.innerHTML=Sec.findings.map(function(f){return'<div class="finding '+f.severity+'"><div class="f-cat">'+sevBadge(f.severity)+' '+esc(f.category)+' <span style="color:var(--muted);font-size:.78rem">('+f.count+' occurrence'+(f.count>1?'s':'')+')<\\/span><\\/div><div class="f-desc">'+esc(f.description)+'<\\/div><\\/div>'}).join('')}

// Security table
document.getElementById('secTbody').innerHTML=Sec.findings.map(function(f){return'<tr><td>'+sevBadge(f.severity)+'<\\/td><td><b>'+esc(f.category)+'<\\/b><\\/td><td>'+esc(f.description)+'<\\/td><td class="r">'+f.count+'<\\/td><\\/tr>'}).join('')||'<tr><td colspan="4" style="text-align:center;color:var(--green);padding:20px">✅ No findings<\\/td><\\/tr>';

/* ═══ ACCESSIBILITY ═══ */
document.getElementById('a11yKpi').innerHTML=[
  kpi('A11y Score',A.score+'/100','',A.score>=90?'var(--green)':A.score>=60?'var(--amber)':'var(--red)'),
  kpi('Total Violations',A.totalViolations),
  kpi('🔴 Critical',A.critical,'',A.critical>0?'var(--red)':'var(--green)'),
  kpi('🟠 Serious',A.serious,'',A.serious>0?'#f97316':'var(--green)'),
  kpi('🟡 Moderate',A.moderate),
  kpi('🔵 Minor',A.minor),
  kpi('Tests Scanned',A.testsScanned),
  kpi('With Issues',A.testsWithViolations+'/'+A.testsScanned)
].join('');

Plotly.newPlot('cA11yPie',[{type:'pie',labels:['Critical','Serious','Moderate','Minor'],values:[A.critical,A.serious,A.moderate,A.minor],hole:.55,marker:{colors:['#ef4444','#f97316','#f59e0b','#3b82f6']},textinfo:'label+value',textfont:{size:11}}],Object.assign({},DL,{margin:{l:0,r:0,t:0,b:0},annotations:[{text:A.totalViolations+'<br>total',showarrow:false,font:{size:16,color:'#e2e8f0'}}]}),PC);

var vl=document.getElementById('violList');
if(A.topViolations.length===0){vl.innerHTML='<div style="padding:30px;text-align:center;color:var(--green);font-weight:600">✅ No accessibility violations found!<\\/div>'}
else{var iMap={critical:'var(--red)',serious:'#f97316',moderate:'var(--amber)',minor:'var(--blue)'};vl.innerHTML=A.topViolations.map(function(v){var c=iMap[v.impact]||'var(--muted)';return'<div class="viol-item"><span class="viol-cnt" style="color:'+c+'">'+v.count+'<\\/span><div class="viol-info"><span class="vid">'+esc(v.id)+'<\\/span> <span class="badge" style="background:rgba(255,255,255,.05);color:'+c+'">'+v.impact+'<\\/span><div class="vdesc">'+esc(v.description)+'<\\/div><\\/div><\\/div>'}).join('')}

/* ═══ BROWSERS ═══ */
if(B.length>0){
  Plotly.newPlot('cRadar',B.map(function(b){var ds=Math.min(100,Math.max(0,100-b.avgDuration/100));return{type:'scatterpolar',fill:'toself',name:b.browser,opacity:.7,r:[b.passRate,b.benchmarkScore,ds,Math.min(100,b.totalRequests/5),100-Math.min(100,b.a11yViolations*10),b.passRate],theta:['Pass Rate','Score','Speed','Network','Accessibility','Pass Rate']}}),Object.assign({},DL,{polar:{radialaxis:{visible:true,range:[0,100],gridcolor:'#334155',color:'#94a3b8'},bgcolor:'rgba(0,0,0,0)',angularaxis:{color:'#94a3b8'}},legend:{font:{color:'#e2e8f0'},orientation:'h',y:1.15}}),PC);

  Plotly.newPlot('cBrowserBar',[{type:'bar',name:'Pass Rate %',x:B.map(function(b){return b.browser}),y:B.map(function(b){return b.passRate}),marker:{color:'#22c55e'}},{type:'bar',name:'Benchmark',x:B.map(function(b){return b.browser}),y:B.map(function(b){return b.benchmarkScore}),marker:{color:'#6366f1'}}],Object.assign({},DL,{barmode:'group',legend:{font:{color:'#e2e8f0'},orientation:'h',y:1.15}}),PC);

  document.getElementById('browserTable').innerHTML='<thead><tr><th>Browser<\\/th><th>Score<\\/th><th>Tier<\\/th><th>Tests<\\/th><th>Pass Rate<\\/th><th>Avg Duration<\\/th><th>P95<\\/th><th>Requests<\\/th><th>Avg Resp<\\/th><th>A11y<\\/th><\\/tr><\\/thead><tbody>'+B.map(function(b){return'<tr><td><b>'+esc(b.browser)+'<\\/b><\\/td><td class="r"><b>'+b.benchmarkScore+'<\\/b><\\/td><td>'+tierBadge(b.tier)+'<\\/td><td class="r">'+b.total+'<\\/td><td class="r">'+b.passRate+'%<\\/td><td class="r">'+fmt(b.avgDuration)+'<\\/td><td class="r">'+fmt(b.p95Duration)+'<\\/td><td class="r">'+b.totalRequests+'<\\/td><td class="r">'+b.avgResponseTime+'ms<\\/td><td class="r">'+b.a11yViolations+'<\\/td><\\/tr>'}).join('')+'<\\/tbody>';
}

<\/script>
</body>
</html>`;
  }
}

export default UniversalReporter;
