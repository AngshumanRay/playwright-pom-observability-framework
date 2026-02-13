/**
 * @file types.ts
 * @description Shared TypeScript interfaces for the observability system.
 *
 * These types are used by:
 *  - `fixtures/observability.fixture.ts` — produces `FixtureObservabilityMetrics`
 *  - `reporters/observability-reporter.ts` — reads metrics and builds `ObservabilitySummary`
 *  - `scripts/generate-performance-benchmark-report.ts` — consumes the summary JSON
 */

// ---------------------------------------------------------------------------
//  Accessibility types
// ---------------------------------------------------------------------------

/** A single accessibility violation found on the page. */
export interface AccessibilityViolation {
  /** Rule identifier (e.g., 'image-alt', 'button-name'). */
  id: string;
  /** Severity level following WCAG impact classification. */
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  /** Human-readable description of the rule. */
  description: string;
  /** Link to Deque University for remediation guidance. */
  helpUrl: string;
  /** Number of DOM nodes affected by this violation. */
  nodes: number;
}

/** Summary of an accessibility scan for one test. */
export interface AccessibilityScanResult {
  /** Total number of unique rule violations detected. */
  totalViolations: number;
  /** Count of critical-severity violations (must fix). */
  critical: number;
  /** Count of serious-severity violations (should fix). */
  serious: number;
  /** Count of moderate-severity violations (consider fixing). */
  moderate: number;
  /** Count of minor-severity violations (nice to fix). */
  minor: number;
  /** Detailed list of each violation. */
  violations: AccessibilityViolation[];
}

// ---------------------------------------------------------------------------
//  Fixture-level metrics (produced per-test by the auto-fixture)
// ---------------------------------------------------------------------------

/**
 * Metrics captured by `observability.fixture.ts` during a single test run.
 * Serialised to JSON and attached to the test result for the reporter to read.
 */
export interface FixtureObservabilityMetrics {
  /** Total number of network requests made during the test. */
  requestCount: number;
  /** Number of requests that failed at the network level. */
  requestFailureCount: number;
  /** Number of HTTP responses with status >= 400. */
  responseErrorCount: number;
  /** Raw response times in milliseconds for every completed request. */
  responseTimesMs: number[];
  /** Average response time across all requests (ms). */
  avgResponseTimeMs: number;
  /** 95th percentile response time (ms). */
  p95ResponseTimeMs: number;
  /** Console error messages captured via `console.error()`. */
  consoleErrors: string[];
  /** Unhandled page error messages (window.onerror). */
  pageErrors: string[];
  /** ISO timestamp when the test started. */
  testStartedAt: string;
  /** ISO timestamp when the test ended. */
  testEndedAt: string;
  /** Wall-clock duration of the test in milliseconds. */
  testDurationMs: number;
  /** Accessibility scan results captured after the test completed. */
  accessibility: AccessibilityScanResult;
}

// ---------------------------------------------------------------------------
//  Reporter-level types (aggregated across all tests)
// ---------------------------------------------------------------------------

/**
 * Per-test entry in the aggregated observability summary.
 * Produced by the ObservabilityReporter from fixture attachments.
 */
export interface TestObservabilityEntry {
  /** Unique Playwright test ID. */
  id: string;
  /** Full test title path (e.g., 'chromium > Suite > test name'). */
  title: string;
  /** Absolute file path of the test spec. */
  file: string;
  /** Playwright project name (e.g., 'chromium', 'firefox'). */
  projectName: string;
  /** Final test status: 'passed', 'failed', 'timedOut', 'skipped'. */
  status: string;
  /** Test outcome: 'expected', 'unexpected', 'flaky', 'skipped'. */
  outcome: string;
  /** Test duration in milliseconds. */
  durationMs: number;
  /** Retry attempt number (0 = first try). */
  retry: number;
  /** ISO timestamp when the test started. */
  startedAt: string;
  /** Total network requests made during the test. */
  requestCount: number;
  /** Number of network-level request failures. */
  requestFailureCount: number;
  /** Number of HTTP 4xx/5xx responses. */
  responseErrorCount: number;
  /** Average response time (ms). */
  avgResponseTimeMs: number;
  /** 95th percentile response time (ms). */
  p95ResponseTimeMs: number;
  /** Maximum single response time (ms). */
  maxResponseTimeMs: number;
  /** Number of console.error() calls captured. */
  consoleErrorCount: number;
  /** Number of unhandled page errors captured. */
  pageErrorCount: number;
  /** Accessibility scan results for this test. */
  accessibility: AccessibilityScanResult;
}

/**
 * Top-level observability summary written to `observability-metrics.json`.
 * This is the main output of the ObservabilityReporter and the input for
 * the benchmark report generator.
 */
export interface ObservabilitySummary {
  /** ISO timestamp when this summary was generated. */
  generatedAt: string;
  /** Unique run identifier (timestamp-based). */
  runId: string;
  /** Aggregate statistics across all tests. */
  overall: {
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    timedOut: number;
    flaky: number;
    avgTestDurationMs: number;
    totalRequests: number;
    requestFailures: number;
    requestFailureRatePct: number;
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
  };
  /** Aggregate accessibility metrics across all tests. */
  accessibilityOverall: {
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    testsWithViolations: number;
    testsScanned: number;
  };
  /** Detailed per-test entries sorted by duration (longest first). */
  tests: TestObservabilityEntry[];
}
