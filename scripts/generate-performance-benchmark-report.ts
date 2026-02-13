/**
 * @file generate-performance-benchmark-report.ts
 * @description Reads `observability-metrics.json` and generates an interactive
 *              HTML benchmark dashboard with 3D Plotly.js charts, KPI cards,
 *              accessibility violation summaries, and browser comparison tables.
 *
 * Scoring formula (per test, weighted composite):
 *   Benchmark = Duration×0.35 + Reliability×0.25 + Quality×0.15
 *             + Throughput×0.10 + Accessibility×0.15
 *
 * Tier classification based on score:
 *   Elite (≥90) | Strong (≥75) | Stable (≥60) | Watch (≥40) | Critical (<40)
 *
 * Usage:
 *   npx tsx scripts/generate-performance-benchmark-report.ts [path-to-metrics.json]
 *
 * Output:
 *   Reports/observability/performance-benchmark-report.html
 *
 * @see {@link ../reporters/observability-reporter.ts} — produces the input JSON
 * @see {@link ../observability/types.ts} — shared type definitions
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  AccessibilityScanResult,
  ObservabilitySummary,
  TestObservabilityEntry
} from '../observability/types';

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

/** Default path to the observability metrics JSON (produced by the reporter). */
const DEFAULT_INPUT = path.resolve(process.cwd(), 'Reports/observability/observability-metrics.json');
/** Directory where the HTML report will be written. */
const OUTPUT_DIR = path.resolve(process.cwd(), 'Reports/observability');
/** Full path of the generated benchmark HTML report. */
const OUTPUT_FILE = path.resolve(OUTPUT_DIR, 'performance-benchmark-report.html');

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/** Quality tier label derived from the benchmark score. */
type BenchmarkTier = 'Elite' | 'Strong' | 'Stable' | 'Watch' | 'Critical';

/** Enriched test entry with computed scores, tier, and browser info. */
interface BenchmarkTestEntry extends TestObservabilityEntry {
  browser: string;
  errorSignals: number;
  throughputPerMin: number;
  durationScore: number;
  reliabilityScore: number;
  qualityScore: number;
  throughputScore: number;
  accessibilityScore: number;
  benchmarkScore: number;
  benchmarkTier: BenchmarkTier;
  startedAtMs: number;
  endedAtMs: number;
}

interface BrowserBenchmarkRow {
  browser: string;
  totalTests: number;
  passed: number;
  failed: number;
  totalRequests: number;
  requestFailures: number;
  requestFailureRatePct: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  passRatePct: number;
  retryRatePct: number;
  errorSignalsPerTest: number;
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  stdDevDurationMs: number;
  cvPct: number;
  throughputTestsPerMin: number;
  durationScore: number;
  reliabilityScore: number;
  qualityScore: number;
  throughputScore: number;
  accessibilityScore: number;
  benchmarkScore: number;
  benchmarkTier: BenchmarkTier;
  a11yViolations: number;
  a11yCritical: number;
  a11ySerious: number;
}

interface BenchmarkPayload {
  generatedAt: string;
  runId: string;
  thresholds: {
    avgDurationTargetMs: number;
    p95DurationTargetMs: number;
    throughputTargetPerMin: number;
    retryRateTargetPct: number;
  };
  overall: {
    totalTests: number;
    totalRequests: number;
    requestFailures: number;
    requestFailureRatePct: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    consoleErrorCount: number;
    pageErrorCount: number;
    passRatePct: number;
    medianDurationMs: number;
    p90DurationMs: number;
    p99DurationMs: number;
    stdDevDurationMs: number;
    cvPct: number;
    throughputTestsPerMin: number;
    retryRatePct: number;
    errorSignalsPerTest: number;
    benchmarkScore: number;
    benchmarkTier: BenchmarkTier;
  };
  accessibility: {
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    testsWithViolations: number;
    testsScanned: number;
    accessibilityScore: number;
    topViolations: { id: string; impact: string; description: string; count: number }[];
  };
  browserRows: BrowserBenchmarkRow[];
  tests: BenchmarkTestEntry[];
}

// ---------------------------------------------------------------------------
//  Math helpers
// ---------------------------------------------------------------------------

/** Round a number to the specified decimal places. */
function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Constrain a value between min and max (inclusive). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Arithmetic mean. Returns 0 for empty arrays. */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Return the p-th percentile from a numeric array. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

/** Population standard deviation. */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
}

// ---------------------------------------------------------------------------
//  Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Score a metric where lower values are better (e.g., duration).
 * Returns 100 if value ≤ target, 0 if value ≥ max, linear interpolation between.
 */
function scoreLowerBetter(value: number, target: number, max: number): number {
  if (value <= target) return 100;
  if (value >= max) return 0;
  return round(clamp((1 - (value - target) / (max - target)) * 100, 0, 100));
}

/**
 * Score a metric where higher values are better (e.g., throughput).
 * Returns 100 if value ≥ target, 0 if value ≤ min, linear interpolation between.
 */
function scoreHigherBetter(value: number, min: number, target: number): number {
  if (value >= target) return 100;
  if (value <= min) return 0;
  return round(clamp(((value - min) / (target - min)) * 100, 0, 100));
}

/** Map a numeric score (0-100) to a human-readable quality tier. */
function tierFromScore(score: number): BenchmarkTier {
  if (score >= 90) return 'Elite';
  if (score >= 75) return 'Strong';
  if (score >= 60) return 'Stable';
  if (score >= 40) return 'Watch';
  return 'Critical';
}

/**
 * Compute an accessibility score (0-100) from violation counts.
 * Penalty weights: critical×4, serious×3, moderate×2, minor×1.
 * Each penalty point deducts 8 from the score.
 */
function a11yScore(a: AccessibilityScanResult): number {
  const penalty = a.critical * 4 + a.serious * 3 + a.moderate * 2 + a.minor * 1;
  return round(clamp(100 - penalty * 8, 0, 100));
}

// ---------------------------------------------------------------------------
//  Data extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the browser name from a test entry.
 * Tries the first segment of the title path, then the project name, then 'unknown'.
 */
function extractBrowserName(test: TestObservabilityEntry): string {
  const head = test.title.split(' > ')[0].trim().toLowerCase();
  if (['chromium', 'firefox', 'webkit'].includes(head)) return head;
  if (test.projectName && test.projectName !== 'default') return test.projectName.toLowerCase();
  return 'unknown';
}

/**
 * Calculate the wall-clock span (ms) for a set of tests.
 * Uses actual timestamps when available, falls back to sum of durations.
 */
function wallTimeMsFromTests(tests: Pick<BenchmarkTestEntry, 'startedAtMs' | 'endedAtMs' | 'durationMs'>[]): number {
  if (tests.length === 0) return 0;
  const starts = tests.map((t) => t.startedAtMs).filter(Number.isFinite);
  const ends = tests.map((t) => t.endedAtMs).filter(Number.isFinite);
  if (starts.length > 0 && ends.length > 0) {
    const span = Math.max(...ends) - Math.min(...starts);
    if (span > 0) return span;
  }
  return tests.reduce((s, t) => s + t.durationMs, 0);
}

// ---------------------------------------------------------------------------
//  Build enriched entries
// ---------------------------------------------------------------------------

/**
 * Enrich a raw test entry with computed benchmark scores and tier.
 *
 * Score formula (weighted composite):
 *   Duration × 0.35 + Reliability × 0.25 + Quality × 0.15
 *   + Throughput × 0.10 + Accessibility × 0.15
 */
function buildBenchmarkTestEntry(test: TestObservabilityEntry): BenchmarkTestEntry {
  const browser = extractBrowserName(test);
  const errorSignals =
    test.requestFailureCount + test.responseErrorCount + test.consoleErrorCount + test.pageErrorCount;
  const throughputPerMin = round(60_000 / Math.max(1, test.durationMs));

  const durationScore = scoreLowerBetter(test.durationMs, 1_500, 9_000);
  const reliabilityBase = test.status === 'passed' ? 100 : test.status === 'skipped' ? 70 : 15;
  const reliabilityScore = clamp(reliabilityBase - test.retry * 15, 0, 100);
  const qualityScore = scoreLowerBetter(errorSignals, 0, 6);
  const throughputScore = scoreHigherBetter(throughputPerMin, 4, 30);
  const accessibilityScore = a11yScore(test.accessibility);

  const benchmarkScore = round(
    durationScore * 0.35 +
    reliabilityScore * 0.25 +
    qualityScore * 0.15 +
    throughputScore * 0.1 +
    accessibilityScore * 0.15
  );

  const startedAtMs = Date.parse(test.startedAt);
  const endedAtMs = Number.isFinite(startedAtMs) ? startedAtMs + test.durationMs : test.durationMs;

  return {
    ...test,
    browser,
    errorSignals,
    throughputPerMin,
    durationScore: round(durationScore),
    reliabilityScore: round(reliabilityScore),
    qualityScore: round(qualityScore),
    throughputScore: round(throughputScore),
    accessibilityScore: round(accessibilityScore),
    benchmarkScore,
    benchmarkTier: tierFromScore(benchmarkScore),
    startedAtMs,
    endedAtMs
  };
}

/**
 * Group tests by browser and compute aggregate benchmark rows.
 * Returns rows sorted by benchmark score (highest first).
 */
function buildBrowserRows(tests: BenchmarkTestEntry[]): BrowserBenchmarkRow[] {
  const groups = new Map<string, BenchmarkTestEntry[]>();
  for (const t of tests) {
    const list = groups.get(t.browser) ?? [];
    list.push(t);
    groups.set(t.browser, list);
  }

  const rows: BrowserBenchmarkRow[] = [];
  for (const [browser, list] of groups.entries()) {
    const durations = list.map((i) => i.durationMs);
    const responseTimes = list.map((i) => i.avgResponseTimeMs).filter((v) => v > 0);
    const passRatePct = list.length === 0 ? 0 : (list.filter((i) => i.status === 'passed').length / list.length) * 100;
    const retryRatePct = list.length === 0 ? 0 : (list.filter((i) => i.retry > 0).length / list.length) * 100;
    const totalRequests = list.reduce((s, i) => s + i.requestCount, 0);
    const requestFailures = list.reduce((s, i) => s + i.requestFailureCount, 0);
    const errorSignalsPerTest = list.length === 0 ? 0 : average(list.map((i) => i.errorSignals));
    const avgDurationMs = average(durations);
    const p95DurationMs = percentile(durations, 95);
    const throughputTestsPerMin = list.length === 0 ? 0 : list.length / (wallTimeMsFromTests(list) / 60_000);

    const durationScore = round(
      scoreLowerBetter(avgDurationMs, 1_500, 7_000) * 0.6 +
      scoreLowerBetter(p95DurationMs, 3_000, 9_500) * 0.4
    );
    const reliabilityScore = round(passRatePct * 0.7 + scoreLowerBetter(retryRatePct, 0, 40) * 0.3);
    const qualityScore = round(scoreLowerBetter(errorSignalsPerTest, 0, 4));
    const throughputScore = round(scoreHigherBetter(throughputTestsPerMin, 5, 22));
    const accessibilityScoreVal = round(average(list.map((i) => i.accessibilityScore)));
    const benchmarkScore = round(
      durationScore * 0.3 +
      reliabilityScore * 0.25 +
      qualityScore * 0.15 +
      throughputScore * 0.1 +
      accessibilityScoreVal * 0.2
    );

    const a11yViolations = list.reduce((s, i) => s + i.accessibility.totalViolations, 0);
    const a11yCritical = list.reduce((s, i) => s + i.accessibility.critical, 0);
    const a11ySerious = list.reduce((s, i) => s + i.accessibility.serious, 0);

    rows.push({
      browser,
      totalTests: list.length,
      passed: list.filter((i) => i.status === 'passed').length,
      failed: list.filter((i) => i.status === 'failed' || i.status === 'timedOut').length,
      totalRequests,
      requestFailures,
      requestFailureRatePct: totalRequests > 0 ? round((requestFailures / totalRequests) * 100) : 0,
      avgResponseTimeMs: round(average(responseTimes)),
      p95ResponseTimeMs: round(percentile(responseTimes, 95)),
      passRatePct: round(passRatePct),
      retryRatePct: round(retryRatePct),
      errorSignalsPerTest: round(errorSignalsPerTest),
      avgDurationMs: round(avgDurationMs),
      medianDurationMs: round(percentile(durations, 50)),
      p95DurationMs: round(p95DurationMs),
      p99DurationMs: round(percentile(durations, 99)),
      stdDevDurationMs: round(stdDev(durations)),
      cvPct: avgDurationMs > 0 ? round((stdDev(durations) / avgDurationMs) * 100) : 0,
      throughputTestsPerMin: round(throughputTestsPerMin),
      durationScore,
      reliabilityScore,
      qualityScore,
      throughputScore,
      accessibilityScore: accessibilityScoreVal,
      benchmarkScore,
      benchmarkTier: tierFromScore(benchmarkScore),
      a11yViolations,
      a11yCritical,
      a11ySerious
    });
  }

  return rows.sort((a, b) => b.benchmarkScore - a.benchmarkScore);
}

// ---------------------------------------------------------------------------
//  Build payload
// ---------------------------------------------------------------------------

/**
 * Build the complete benchmark payload from the raw observability summary.
 * This payload is serialised into the HTML report as an inline JSON variable
 * that the client-side Plotly.js charts read at render time.
 */
function buildPayload(summary: ObservabilitySummary): BenchmarkPayload {
  const tests = summary.tests.map(buildBenchmarkTestEntry);
  const durations = tests.map((i) => i.durationMs);
  const responseTimes = tests.map((i) => i.avgResponseTimeMs).filter((v) => v > 0);
  const browserRows = buildBrowserRows(tests);
  const passRatePct = tests.length === 0 ? 0 : (tests.filter((i) => i.status === 'passed').length / tests.length) * 100;
  const retryRatePct = tests.length === 0 ? 0 : (tests.filter((i) => i.retry > 0).length / tests.length) * 100;
  const errorSignalsPerTest = tests.length === 0 ? 0 : average(tests.map((i) => i.errorSignals));
  const totalRequests = tests.reduce((s, i) => s + i.requestCount, 0);
  const requestFailures = tests.reduce((s, i) => s + i.requestFailureCount, 0);
  const consoleErrorCount = tests.reduce((s, i) => s + i.consoleErrorCount, 0);
  const pageErrorCount = tests.reduce((s, i) => s + i.pageErrorCount, 0);
  const throughputTestsPerMin = tests.length === 0 ? 0 : tests.length / (wallTimeMsFromTests(tests) / 60_000);
  const avgDurationMs = average(durations);
  const p95DurationMs = percentile(durations, 95);
  const durationScore = round(
    scoreLowerBetter(avgDurationMs, 1_500, 7_000) * 0.6 + scoreLowerBetter(p95DurationMs, 3_000, 9_500) * 0.4
  );
  const reliabilityScore = round(passRatePct * 0.7 + scoreLowerBetter(retryRatePct, 0, 40) * 0.3);
  const qualityScore = round(scoreLowerBetter(errorSignalsPerTest, 0, 4));
  const throughputScore = round(scoreHigherBetter(throughputTestsPerMin, 5, 22));
  const benchmarkScore = round(
    durationScore * 0.4 + reliabilityScore * 0.3 + qualityScore * 0.2 + throughputScore * 0.1
  );

  // Accessibility aggregation
  const a11y = summary.accessibilityOverall;
  const overallA11yScore = round(average(tests.map((t) => t.accessibilityScore)));

  // Aggregate top violations across all tests
  const violationMap = new Map<string, { id: string; impact: string; description: string; count: number }>();
  for (const t of tests) {
    for (const v of t.accessibility.violations) {
      const existing = violationMap.get(v.id);
      if (existing) {
        existing.count += v.nodes;
      } else {
        violationMap.set(v.id, { id: v.id, impact: v.impact, description: v.description, count: v.nodes });
      }
    }
  }
  const topViolations = Array.from(violationMap.values()).sort((a, b) => b.count - a.count).slice(0, 10);

  return {
    generatedAt: new Date().toISOString(),
    runId: summary.runId,
    thresholds: {
      avgDurationTargetMs: 1500,
      p95DurationTargetMs: 3000,
      throughputTargetPerMin: 22,
      retryRateTargetPct: 0
    },
    overall: {
      totalTests: summary.overall.totalTests,
      totalRequests,
      requestFailures,
      requestFailureRatePct: totalRequests > 0 ? round((requestFailures / totalRequests) * 100) : 0,
      avgResponseTimeMs: round(average(responseTimes)),
      p95ResponseTimeMs: round(percentile(responseTimes, 95)),
      consoleErrorCount,
      pageErrorCount,
      passRatePct: round(passRatePct),
      medianDurationMs: round(percentile(durations, 50)),
      p90DurationMs: round(percentile(durations, 90)),
      p99DurationMs: round(percentile(durations, 99)),
      stdDevDurationMs: round(stdDev(durations)),
      cvPct: avgDurationMs > 0 ? round((stdDev(durations) / avgDurationMs) * 100) : 0,
      throughputTestsPerMin: round(throughputTestsPerMin),
      retryRatePct: round(retryRatePct),
      errorSignalsPerTest: round(errorSignalsPerTest),
      benchmarkScore,
      benchmarkTier: tierFromScore(benchmarkScore)
    },
    accessibility: {
      totalViolations: a11y.totalViolations,
      critical: a11y.critical,
      serious: a11y.serious,
      moderate: a11y.moderate,
      minor: a11y.minor,
      testsWithViolations: a11y.testsWithViolations,
      testsScanned: a11y.testsScanned,
      accessibilityScore: overallA11yScore,
      topViolations
    },
    browserRows,
    tests
  };
}

// ---------------------------------------------------------------------------
//  HTML Builder
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML string for the benchmark dashboard.
 *
 * The report includes:
 *  - KPI cards (benchmark score, pass rate, duration, throughput, etc.)
 *  - Accessibility overview with violation donut chart
 *  - 3D scatter plots (test cloud + browser comparison)
 *  - Radar chart, box plot, tier pie chart
 *  - Throughput vs pass rate combo chart
 *  - Top 10 slowest tests bar chart
 *  - Browser comparison table
 *  - Glossary of metrics for beginners
 *
 * All charts use Plotly.js loaded from CDN.
 */
function buildHtml(payload: BenchmarkPayload): string {
  const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Performance &amp; Accessibility Benchmark Report</title>
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"><\/script>
  <style>
    :root {
      --bg: #f6f8fc;
      --surface: #ffffff;
      --ink: #1a1f36;
      --muted: #6b7280;
      --accent: #6366f1;
      --accent-soft: #eef2ff;
      --green: #059669;
      --green-soft: #ecfdf5;
      --amber: #d97706;
      --amber-soft: #fffbeb;
      --red: #dc2626;
      --red-soft: #fef2f2;
      --blue: #2563eb;
      --blue-soft: #eff6ff;
      --purple: #7c3aed;
      --purple-soft: #f5f3ff;
      --border: #e5e7eb;
      --radius: 12px;
      --radius-sm: 8px;
      --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
      --shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
      color: var(--ink);
      background: var(--bg);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    .header {
      background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%);
      color: #fff;
      border-radius: var(--radius);
      padding: 32px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-lg);
    }
    .header h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 8px; }
    .header .meta { display: flex; flex-wrap: wrap; gap: 20px; font-size: 0.875rem; color: rgba(255,255,255,0.8); }
    .header .meta strong { color: #fff; }
    .section-title {
      font-size: 1.125rem; font-weight: 700; color: var(--ink);
      margin: 28px 0 14px; padding-bottom: 8px;
      border-bottom: 2px solid var(--accent);
      display: flex; align-items: center; gap: 8px;
    }
    .section-title .icon { font-size: 1.2rem; }
    .kpi-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 14px; margin-bottom: 24px;
    }
    .kpi {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 18px; box-shadow: var(--shadow);
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .kpi:hover { transform: translateY(-2px); box-shadow: var(--shadow-lg); }
    .kpi-label {
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--muted); margin-bottom: 6px;
    }
    .kpi-value { font-size: 1.75rem; font-weight: 800; line-height: 1.2; }
    .kpi-sub { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
    .badge {
      display: inline-flex; align-items: center; padding: 3px 10px;
      border-radius: 999px; font-size: 0.7rem; font-weight: 700;
      letter-spacing: 0.04em; text-transform: uppercase;
    }
    .tier-Elite    { background: var(--green-soft); color: var(--green); }
    .tier-Strong   { background: var(--blue-soft);  color: var(--blue); }
    .tier-Stable   { background: var(--amber-soft); color: var(--amber); }
    .tier-Watch    { background: #fff7ed;           color: #ea580c; }
    .tier-Critical { background: var(--red-soft);   color: var(--red); }
    .impact-critical { background: var(--red-soft);   color: var(--red); }
    .impact-serious  { background: #fff7ed;           color: #ea580c; }
    .impact-moderate { background: var(--amber-soft); color: var(--amber); }
    .impact-minor    { background: var(--blue-soft);  color: var(--blue); }
    .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 16px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 16px; }
    .panel {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow);
    }
    .panel h3 { font-size: 0.9rem; font-weight: 700; color: var(--ink); margin-bottom: 12px; }
    .panel .help-text { font-size: 0.78rem; color: var(--muted); margin-bottom: 10px; line-height: 1.5; }
    .chart { width: 100%; height: 360px; }
    .chart-tall { width: 100%; height: 400px; }
    .table-wrap {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow); overflow-x: auto; margin-bottom: 16px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid var(--border); }
    th {
      font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--muted); background: #f9fafb;
      position: sticky; top: 0; z-index: 1;
    }
    tr:hover td { background: #f9fafb; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .violation-list { list-style: none; }
    .violation-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px; border-bottom: 1px solid var(--border);
    }
    .violation-item:last-child { border-bottom: none; }
    .violation-count { font-size: 1.1rem; font-weight: 800; min-width: 36px; text-align: center; }
    .violation-info { flex: 1; }
    .violation-info .id { font-weight: 700; font-size: 0.85rem; }
    .violation-info .desc { font-size: 0.8rem; color: var(--muted); }
    .glossary-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px;
    }
    .term {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 14px;
    }
    .term h4 { font-size: 0.85rem; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
    .term p { font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
    @media (max-width: 1100px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }
    @media (max-width: 680px) { .container { padding: 12px; } .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
    @media print {
      body { background: #fff; }
      .header { background: #1e1b4b !important; -webkit-print-color-adjust: exact; }
      .kpi, .panel, .table-wrap { break-inside: avoid; }
    }
  </style>
</head>
<body>
<div class="container">

  <header class="header" role="banner">
    <h1>📊 Performance &amp; Accessibility Benchmark Report</h1>
    <div class="meta">
      <span>Run ID: <strong>${payload.runId}</strong></span>
      <span>Generated: <strong>${new Date(payload.generatedAt).toLocaleString()}</strong></span>
      <span>Tests: <strong>${payload.overall.totalTests}</strong></span>
      <span>Browsers: <strong>${payload.browserRows.map((r) => r.browser).join(', ')}</strong></span>
    </div>
  </header>

  <h2 class="section-title"><span class="icon">🎯</span> Overall Health at a Glance</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    These cards summarize the entire test run. Green numbers are good, amber needs attention, red needs action.
  </p>
  <div class="kpi-grid">
    <article class="kpi">
      <div class="kpi-label">Benchmark Score</div>
      <div class="kpi-value">${payload.overall.benchmarkScore}<small>/100</small></div>
      <span class="badge tier-${payload.overall.benchmarkTier}">${payload.overall.benchmarkTier}</span>
      <div class="kpi-sub">Weighted score combining speed, reliability, quality &amp; accessibility</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Pass Rate</div>
      <div class="kpi-value" style="color:${payload.overall.passRatePct >= 90 ? 'var(--green)' : payload.overall.passRatePct >= 70 ? 'var(--amber)' : 'var(--red)'}">${payload.overall.passRatePct}%</div>
      <div class="kpi-sub">How many tests finished successfully</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Median Duration</div>
      <div class="kpi-value">${payload.overall.medianDurationMs}<small> ms</small></div>
      <div class="kpi-sub">Typical test run time (middle value)</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">P99 Duration</div>
      <div class="kpi-value">${payload.overall.p99DurationMs}<small> ms</small></div>
      <div class="kpi-sub">Slowest 1% of tests — worst-case time</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Consistency (CV%)</div>
      <div class="kpi-value">${payload.overall.cvPct}%</div>
      <div class="kpi-sub">Lower = more consistent run times</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Throughput</div>
      <div class="kpi-value">${payload.overall.throughputTestsPerMin}<small> /min</small></div>
      <div class="kpi-sub">Tests completed per minute</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Network Requests</div>
      <div class="kpi-value">${payload.overall.totalRequests}</div>
      <div class="kpi-sub">${payload.overall.requestFailures} failed (${payload.overall.requestFailureRatePct}%)</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Avg Response Time</div>
      <div class="kpi-value">${payload.overall.avgResponseTimeMs}<small> ms</small></div>
      <div class="kpi-sub">P95: ${payload.overall.p95ResponseTimeMs} ms</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Console + Page Errors</div>
      <div class="kpi-value" style="color:${(payload.overall.consoleErrorCount + payload.overall.pageErrorCount) === 0 ? 'var(--green)' : 'var(--red)'}">${payload.overall.consoleErrorCount + payload.overall.pageErrorCount}</div>
      <div class="kpi-sub">${payload.overall.consoleErrorCount} console, ${payload.overall.pageErrorCount} page errors</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Retry Rate</div>
      <div class="kpi-value" style="color:${payload.overall.retryRatePct === 0 ? 'var(--green)' : 'var(--amber)'}">${payload.overall.retryRatePct}%</div>
      <div class="kpi-sub">Tests that needed retries to pass</div>
    </article>
  </div>

  <h2 class="section-title"><span class="icon">♿</span> Accessibility Overview</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    Every test page is automatically scanned for common accessibility issues. Critical and serious issues should be fixed first.
  </p>
  <div class="kpi-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
    <article class="kpi">
      <div class="kpi-label">Accessibility Score</div>
      <div class="kpi-value" style="color:${payload.accessibility.accessibilityScore >= 90 ? 'var(--green)' : payload.accessibility.accessibilityScore >= 60 ? 'var(--amber)' : 'var(--red)'}">${payload.accessibility.accessibilityScore}<small>/100</small></div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Total Violations</div>
      <div class="kpi-value">${payload.accessibility.totalViolations}</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">🔴 Critical</div>
      <div class="kpi-value" style="color:var(--red)">${payload.accessibility.critical}</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">🟠 Serious</div>
      <div class="kpi-value" style="color:#ea580c">${payload.accessibility.serious}</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">🟡 Moderate</div>
      <div class="kpi-value" style="color:var(--amber)">${payload.accessibility.moderate}</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">🔵 Minor</div>
      <div class="kpi-value" style="color:var(--blue)">${payload.accessibility.minor}</div>
    </article>
    <article class="kpi">
      <div class="kpi-label">Pages with Issues</div>
      <div class="kpi-value">${payload.accessibility.testsWithViolations}<small>/${payload.accessibility.testsScanned}</small></div>
    </article>
  </div>

  <div class="grid-2">
    <article class="panel">
      <h3>Accessibility Violations by Impact</h3>
      <p class="help-text">Distribution of violations by severity. Fix critical &amp; serious issues first for the biggest impact.</p>
      <div id="chart-a11y-impact" class="chart"></div>
    </article>
    <article class="panel">
      <h3>Top Accessibility Violations</h3>
      <p class="help-text">Most frequent issues found across all test pages. Click any rule ID to learn how to fix it.</p>
      <ul class="violation-list" id="violation-list"></ul>
    </article>
  </div>

  <h2 class="section-title"><span class="icon">⚡</span> Performance Analysis</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    Interactive 3D charts let you explore relationships between speed, reliability and quality. Drag to rotate, scroll to zoom.
  </p>
  <div class="grid-2">
    <article class="panel">
      <h3>3D Test Benchmark Cloud</h3>
      <p class="help-text">Each dot = one test. X = how long it took, Y = throughput, Z = overall score. Bigger dots have more errors.</p>
      <div id="chart-3d-tests" class="chart-tall"></div>
    </article>
    <article class="panel">
      <h3>3D Browser Comparison</h3>
      <p class="help-text">Each bubble = one browser. Size &amp; color show the benchmark score. Ideal position = bottom-right-top.</p>
      <div id="chart-3d-browsers" class="chart-tall"></div>
    </article>
  </div>
  <div class="grid-3">
    <article class="panel">
      <h3>Score Breakdown (Radar)</h3>
      <p class="help-text">Compare each browser across 5 quality dimensions. Outer edge = perfect score.</p>
      <div id="chart-radar" class="chart"></div>
    </article>
    <article class="panel">
      <h3>Duration Spread by Browser</h3>
      <p class="help-text">Box plot showing min, median, max and outliers. A tight box means consistent performance.</p>
      <div id="chart-box" class="chart"></div>
    </article>
    <article class="panel">
      <h3>Tier Distribution</h3>
      <p class="help-text">How many tests fall into each quality tier. Aim for mostly Elite &amp; Strong.</p>
      <div id="chart-tier" class="chart"></div>
    </article>
  </div>
  <div class="grid-2">
    <article class="panel">
      <h3>Throughput vs Pass Rate</h3>
      <p class="help-text">Bars = speed (tests/min), line = reliability (pass %). Both should be high.</p>
      <div id="chart-throughput-pass" class="chart"></div>
    </article>
    <article class="panel">
      <h3>Top 10 Slowest Tests</h3>
      <p class="help-text">The longest-running tests — prime candidates for optimization.</p>
      <div id="chart-bottleneck" class="chart"></div>
    </article>
  </div>

  <h2 class="section-title"><span class="icon">🌐</span> Browser Comparison Table</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    Side-by-side metrics for each browser. Look for browsers with low pass rates or high retry rates.
  </p>
  <div class="table-wrap">
    <table role="table" aria-label="Browser benchmark comparison">
      <thead>
        <tr>
          <th scope="col">Browser</th><th scope="col">Score</th><th scope="col">Tier</th>
          <th scope="col">Pass Rate</th><th scope="col">Avg Duration</th><th scope="col">P95 Duration</th>
          <th scope="col">CV%</th><th scope="col">Requests</th><th scope="col">Req Fail %</th>
          <th scope="col">Avg Resp</th><th scope="col">P95 Resp</th><th scope="col">Retry %</th>
          <th scope="col">Errors/Test</th><th scope="col">Tests/min</th><th scope="col">A11y Issues</th>
        </tr>
      </thead>
      <tbody id="browser-rows"></tbody>
    </table>
  </div>

  <h2 class="section-title"><span class="icon">📋</span> Per-Test Observability Data</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    Detailed metrics for every individual test — network requests, response times, errors, accessibility, and benchmark scores.
  </p>
  <div class="table-wrap" style="max-height:600px;overflow-y:auto;">
    <table role="table" aria-label="Per-test observability data">
      <thead>
        <tr>
          <th scope="col">Test Name</th><th scope="col">Browser</th><th scope="col">Status</th>
          <th scope="col">Duration</th><th scope="col">Requests</th><th scope="col">Req Fails</th>
          <th scope="col">Avg Resp</th><th scope="col">P95 Resp</th><th scope="col">Console Err</th>
          <th scope="col">Page Err</th><th scope="col">Retry</th><th scope="col">A11y Score</th>
          <th scope="col">Benchmark</th><th scope="col">Tier</th>
        </tr>
      </thead>
      <tbody id="test-rows"></tbody>
    </table>
  </div>

  <h2 class="section-title"><span class="icon">📖</span> What Do These Terms Mean?</h2>
  <p style="color:var(--muted);font-size:0.85rem;margin-bottom:14px;">
    Quick explanations of every metric in this report, written for beginners.
  </p>
  <div class="glossary-grid">
    <article class="term"><h4>Benchmark Score</h4><p>A single number (0-100) combining speed, reliability, code quality, throughput &amp; accessibility. Higher is better.</p></article>
    <article class="term"><h4>Benchmark Tier</h4><p>A grade based on score: <strong>Elite</strong> (90+), <strong>Strong</strong> (75+), <strong>Stable</strong> (60+), <strong>Watch</strong> (40+), <strong>Critical</strong> (&lt;40).</p></article>
    <article class="term"><h4>Pass Rate</h4><p>Percentage of tests that finished with a "passed" result. 100% means everything worked.</p></article>
    <article class="term"><h4>Throughput</h4><p>How many tests complete every minute. More = faster test suite.</p></article>
    <article class="term"><h4>Median / P90 / P95 / P99</h4><p>Duration percentiles. Median = typical time. P99 = worst-case (only 1% slower). Helps spot slow outliers.</p></article>
    <article class="term"><h4>CV% (Coefficient of Variation)</h4><p>Measures consistency. Low CV% = similar run times. High CV% = unpredictable durations.</p></article>
    <article class="term"><h4>Request Failure Rate</h4><p>Percentage of network requests that failed. Should be 0% in a healthy app.</p></article>
    <article class="term"><h4>Avg / P95 Response Time</h4><p>How fast the server responds. Average is typical; P95 shows the slower end.</p></article>
    <article class="term"><h4>Error Signals</h4><p>Total count of request failures + HTTP errors + console errors + page crashes. Zero is ideal.</p></article>
    <article class="term"><h4>Accessibility Score</h4><p>Score (0-100) based on how many accessibility violations were found. Fewer violations = higher score.</p></article>
    <article class="term"><h4>Accessibility Violations</h4><p>Issues like missing alt text, empty buttons, skipped headings, or missing form labels.</p></article>
    <article class="term"><h4>3D Charts</h4><p>Interactive visualizations. Drag to rotate, scroll to zoom. Each point represents a test or browser.</p></article>
  </div>

</div>

<script>
  var payload = ${safePayload};
  var tests = payload.tests;
  var rows = payload.browserRows;
  var statusColor = { passed:'#059669', failed:'#dc2626', timedOut:'#dc2626', skipped:'#d97706' };
  var tierColor = { Elite:'#059669', Strong:'#2563eb', Stable:'#d97706', Watch:'#ea580c', Critical:'#dc2626' };
  var impactColor = { critical:'#dc2626', serious:'#ea580c', moderate:'#d97706', minor:'#2563eb' };
  var baseLayout = {
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{ family:'-apple-system,BlinkMacSystemFont,Inter,Segoe UI,sans-serif', color:'#1a1f36', size:12 },
    margin:{ l:50, r:20, t:16, b:50 }
  };

  Plotly.newPlot('chart-a11y-impact',[{
    type:'pie', labels:['Critical','Serious','Moderate','Minor'],
    values:[payload.accessibility.critical,payload.accessibility.serious,payload.accessibility.moderate,payload.accessibility.minor],
    hole:0.55, marker:{colors:['#dc2626','#ea580c','#d97706','#2563eb']},
    textinfo:'label+value', textfont:{size:12},
    hovertemplate:'%{label}: %{value} violations<extra></extra>'
  }],{
    ...baseLayout, margin:{l:0,r:0,t:0,b:0},
    annotations:[{text:payload.accessibility.totalViolations+'<br>total',showarrow:false,font:{size:18,color:'#1a1f36'}}]
  },{responsive:true,displaylogo:false});

  var vlList=document.getElementById('violation-list');
  if(payload.accessibility.topViolations.length===0){
    vlList.innerHTML='<li style="padding:20px;color:var(--green);font-weight:600;">✅ No accessibility violations found!</li>';
  } else {
    vlList.innerHTML=payload.accessibility.topViolations.map(function(v){
      return '<li class="violation-item"><span class="violation-count" style="color:'+(impactColor[v.impact]||'#6b7280')+'">'+v.count+'</span><div class="violation-info"><span class="id">'+escapeHtml(v.id)+'</span> <span class="badge impact-'+v.impact+'">'+v.impact+'</span><div class="desc">'+escapeHtml(v.description)+'</div></div></li>';
    }).join('');
  }

  Plotly.newPlot('chart-3d-tests',[{
    type:'scatter3d',mode:'markers',
    x:tests.map(function(t){return t.durationMs}),
    y:tests.map(function(t){return t.throughputPerMin}),
    z:tests.map(function(t){return t.benchmarkScore}),
    text:tests.map(function(t){return safeText(t.title)+'<br>Browser: '+t.browser+'<br>Status: '+t.status+'<br>Tier: '+t.benchmarkTier+'<br>A11y: '+t.accessibilityScore+'/100'}),
    marker:{
      size:tests.map(function(t){return Math.max(6,Math.min(17,5+t.errorSignals*2))}),
      color:tests.map(function(t){return statusColor[t.status]||'#6366f1'}),
      opacity:0.85, line:{width:0.5,color:'#1e1b4b'}
    },
    hovertemplate:'%{text}<br>Duration: %{x} ms<br>Throughput: %{y}/min<br>Score: %{z}<extra></extra>'
  }],{
    ...baseLayout, margin:{l:0,r:0,t:8,b:0},
    scene:{
      xaxis:{title:'Duration (ms)',gridcolor:'#e5e7eb'},
      yaxis:{title:'Throughput (/min)',gridcolor:'#e5e7eb'},
      zaxis:{title:'Benchmark Score',gridcolor:'#e5e7eb',range:[0,100]},
      bgcolor:'rgba(0,0,0,0)'
    }
  },{responsive:true,displaylogo:false});

  Plotly.newPlot('chart-3d-browsers',[{
    type:'scatter3d',mode:'markers+text',
    x:rows.map(function(r){return r.avgDurationMs}),
    y:rows.map(function(r){return r.throughputTestsPerMin}),
    z:rows.map(function(r){return r.passRatePct}),
    text:rows.map(function(r){return r.browser}),
    textposition:'top center',
    hovertemplate:'Browser: %{text}<br>Avg Duration: %{x} ms<br>Throughput: %{y}/min<br>Pass Rate: %{z}%<extra></extra>',
    marker:{
      size:rows.map(function(r){return Math.max(12,Math.min(36,r.benchmarkScore/3.5))}),
      color:rows.map(function(r){return r.benchmarkScore}),
      colorscale:[[0,'#dc2626'],[0.4,'#d97706'],[0.7,'#2563eb'],[1,'#059669']],
      cmin:0,cmax:100,showscale:true,
      colorbar:{title:'Score',thickness:12,len:0.6},
      line:{width:0.5,color:'#1e1b4b'}
    }
  }],{
    ...baseLayout, margin:{l:0,r:0,t:8,b:0},
    scene:{
      xaxis:{title:'Avg Duration (ms)',gridcolor:'#e5e7eb'},
      yaxis:{title:'Throughput (/min)',gridcolor:'#e5e7eb'},
      zaxis:{title:'Pass Rate (%)',range:[0,100],gridcolor:'#e5e7eb'},
      bgcolor:'rgba(0,0,0,0)'
    }
  },{responsive:true,displaylogo:false});

  var radarTraces=rows.map(function(row){return{
    type:'scatterpolar',
    r:[row.durationScore,row.reliabilityScore,row.qualityScore,row.throughputScore,row.accessibilityScore,row.durationScore],
    theta:['Speed','Reliability','Quality','Throughput','Accessibility','Speed'],
    fill:'toself',name:row.browser,opacity:0.7
  }});
  Plotly.newPlot('chart-radar',radarTraces,{
    ...baseLayout,
    polar:{radialaxis:{visible:true,range:[0,100],gridcolor:'#e5e7eb'},bgcolor:'rgba(0,0,0,0)'},
    legend:{orientation:'h',y:1.18,x:0}
  },{responsive:true,displaylogo:false});

  var byBrowser={};
  tests.forEach(function(t){if(!byBrowser[t.browser])byBrowser[t.browser]=[];byBrowser[t.browser].push(t.durationMs)});
  var boxTraces=Object.entries(byBrowser).map(function(e){return{type:'box',name:e[0],y:e[1],boxpoints:'all',jitter:0.35,pointpos:0,marker:{opacity:0.6,size:5}}});
  Plotly.newPlot('chart-box',boxTraces,{...baseLayout,yaxis:{title:'Duration (ms)',gridcolor:'#e5e7eb'},xaxis:{title:'Browser'}},{responsive:true,displaylogo:false});

  var tiers=['Elite','Strong','Stable','Watch','Critical'];
  var tierValues=tiers.map(function(tier){return tests.filter(function(t){return t.benchmarkTier===tier}).length});
  Plotly.newPlot('chart-tier',[{type:'pie',labels:tiers,values:tierValues,hole:0.5,marker:{colors:tiers.map(function(t){return tierColor[t]})},textinfo:'label+percent',textfont:{size:12}}],{...baseLayout,margin:{l:0,r:0,t:0,b:0}},{responsive:true,displaylogo:false});

  Plotly.newPlot('chart-throughput-pass',[
    {type:'bar',x:rows.map(function(r){return r.browser}),y:rows.map(function(r){return r.throughputTestsPerMin}),name:'Throughput (/min)',marker:{color:'#6366f1'}},
    {type:'scatter',x:rows.map(function(r){return r.browser}),y:rows.map(function(r){return r.passRatePct}),name:'Pass Rate (%)',mode:'lines+markers',yaxis:'y2',line:{color:'#059669',width:2.5},marker:{size:8}}
  ],{...baseLayout,yaxis:{title:'Throughput (/min)',gridcolor:'#e5e7eb'},yaxis2:{title:'Pass Rate (%)',overlaying:'y',side:'right',range:[0,100],gridcolor:'#e5e7eb'},legend:{orientation:'h',y:1.15,x:0}},{responsive:true,displaylogo:false});

  var topBottlenecks=tests.slice().sort(function(a,b){return b.durationMs-a.durationMs}).slice(0,10).reverse();
  Plotly.newPlot('chart-bottleneck',[{
    type:'bar',orientation:'h',
    y:topBottlenecks.map(function(t){return shortText(t.title,58)}),
    x:topBottlenecks.map(function(t){return t.durationMs}),
    marker:{color:topBottlenecks.map(function(t){return tierColor[t.benchmarkTier]})},
    hovertemplate:'%{y}<br>Duration: %{x} ms<extra></extra>'
  }],{...baseLayout,xaxis:{title:'Duration (ms)',gridcolor:'#e5e7eb'},yaxis:{automargin:true}},{responsive:true,displaylogo:false});

  var rowHtml=rows.map(function(row){
    return '<tr>'
      +'<td><strong>'+escapeHtml(row.browser)+'</strong></td>'
      +'<td class="num"><strong>'+row.benchmarkScore+'</strong></td>'
      +'<td><span class="badge tier-'+row.benchmarkTier+'">'+row.benchmarkTier+'</span></td>'
      +'<td class="num">'+row.passRatePct+'%</td>'
      +'<td class="num">'+row.avgDurationMs+' ms</td>'
      +'<td class="num">'+row.p95DurationMs+' ms</td>'
      +'<td class="num">'+row.cvPct+'%</td>'
      +'<td class="num">'+row.totalRequests+'</td>'
      +'<td class="num">'+row.requestFailureRatePct+'%</td>'
      +'<td class="num">'+row.avgResponseTimeMs+' ms</td>'
      +'<td class="num">'+row.p95ResponseTimeMs+' ms</td>'
      +'<td class="num">'+row.retryRatePct+'%</td>'
      +'<td class="num">'+row.errorSignalsPerTest+'</td>'
      +'<td class="num">'+row.throughputTestsPerMin+'</td>'
      +'<td class="num">'+row.a11yViolations+' <small>('+row.a11yCritical+' crit)</small></td>'
    +'</tr>';
  });
  document.getElementById('browser-rows').innerHTML=rowHtml.join('');

  // Per-test observability table
  var testRowHtml=tests.slice().sort(function(a,b){return b.durationMs-a.durationMs}).map(function(t){
    var statusBg=t.status==='passed'?'var(--green-soft)':t.status==='failed'||t.status==='timedOut'?'var(--red-soft)':'var(--amber-soft)';
    var statusFg=t.status==='passed'?'var(--green)':t.status==='failed'||t.status==='timedOut'?'var(--red)':'var(--amber)';
    var shortName=t.title.split(' > ').slice(-1)[0];
    return '<tr>'
      +'<td title="'+escapeHtml(t.title)+'">'+escapeHtml(shortName)+'</td>'
      +'<td>'+escapeHtml(t.browser)+'</td>'
      +'<td><span class="badge" style="background:'+statusBg+';color:'+statusFg+'">'+t.status+'</span></td>'
      +'<td class="num">'+t.durationMs+' ms</td>'
      +'<td class="num">'+t.requestCount+'</td>'
      +'<td class="num" style="color:'+(t.requestFailureCount>0?'var(--red)':'inherit')+'">'+t.requestFailureCount+'</td>'
      +'<td class="num">'+t.avgResponseTimeMs+' ms</td>'
      +'<td class="num">'+t.p95ResponseTimeMs+' ms</td>'
      +'<td class="num" style="color:'+(t.consoleErrorCount>0?'var(--red)':'inherit')+'">'+t.consoleErrorCount+'</td>'
      +'<td class="num" style="color:'+(t.pageErrorCount>0?'var(--red)':'inherit')+'">'+t.pageErrorCount+'</td>'
      +'<td class="num">'+t.retry+'</td>'
      +'<td class="num">'+(t.accessibilityScore)+'/100</td>'
      +'<td class="num"><strong>'+t.benchmarkScore+'</strong></td>'
      +'<td><span class="badge tier-'+t.benchmarkTier+'">'+t.benchmarkTier+'</span></td>'
    +'</tr>';
  });
  document.getElementById('test-rows').innerHTML=testRowHtml.join('');

  function shortText(text,limit){return text.length<=limit?text:text.slice(0,limit-3)+'...';}
  function safeText(text){return text.replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function escapeHtml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

/**
 * Entry point: read the metrics JSON, build the payload, write the HTML report.
 * Accepts an optional CLI argument for a custom metrics file path.
 */
async function main(): Promise<void> {
  const metricsPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
  const raw = await fs.readFile(metricsPath, 'utf-8');
  const summary = JSON.parse(raw) as ObservabilitySummary;
  const payload = buildPayload(summary);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, buildHtml(payload), 'utf-8');

  console.log('[benchmark] Report written to ' + OUTPUT_FILE);
}

// Run and handle errors gracefully
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[benchmark] Failed to build report: ' + message);
  process.exit(1);
});
