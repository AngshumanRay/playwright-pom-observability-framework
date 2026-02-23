/**
 * @file types.ts
 * @description Shared TypeScript interfaces for the entire observability system.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THIS FILE IS THE "DATA DICTIONARY" — it defines the SHAPE of every   ║
 * ║  piece of observability data flowing through the framework.            ║
 * ║                                                                        ║
 * ║  If you want to add a new metric (e.g., memory usage), you define     ║
 * ║  it HERE first, then populate it in the fixture, then consume it in   ║
 * ║  the reporter.                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DATA FLOW — who produces and consumes each type:
 *
 *   FixtureObservabilityMetrics
 *     PRODUCED BY: fixtures/observability.fixture.ts (per-test, saved as JSON attachment)
 *     CONSUMED BY: reporters/observability-reporter.ts (reads from attachment)
 *                  reporters/UniversalReporter.ts (reads from attachment)
 *
 *   TestObservabilityEntry
 *     PRODUCED BY: reporters/observability-reporter.ts (enriched with Playwright metadata)
 *     CONSUMED BY: scripts/generate-performance-benchmark-report.ts
 *
 *   ObservabilitySummary
 *     PRODUCED BY: reporters/observability-reporter.ts (aggregated, written to JSON file)
 *     CONSUMED BY: scripts/generate-performance-benchmark-report.ts (reads JSON file)
 *
 *   AccessibilityViolation / AccessibilityScanResult
 *     PRODUCED BY: fixtures/observability.fixture.ts (scan runs after each test)
 *     CONSUMED BY: All reporters and scripts
 *
 * @see {@link ../fixtures/observability.fixture.ts} — produces FixtureObservabilityMetrics
 * @see {@link ../reporters/observability-reporter.ts} — reads metrics, builds ObservabilitySummary
 * @see {@link ../scripts/generate-performance-benchmark-report.ts} — consumes the summary JSON
 * @see {@link ../PROJECT-ARCHITECTURE.md} — full architecture documentation
 */

// ---------------------------------------------------------------------------
//  Accessibility types
//  These types represent WCAG accessibility violations found during scanning.
//  The accessibility scanner in observability.fixture.ts checks 8 rules and
//  produces violations matching this structure.
// ---------------------------------------------------------------------------

/**
 * A single accessibility violation found on the page.
 *
 * Example: If a page has 3 images without alt text, there would be ONE
 * AccessibilityViolation with `id: 'image-alt'` and `nodes: 3`.
 */
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

/**
 * Summary of an accessibility scan for one test.
 *
 * After each test completes, the observability fixture scans the page for
 * accessibility issues. This interface holds the aggregated counts and the
 * detailed list of violations found.
 *
 * The benchmark report uses these counts to compute an accessibility score:
 *   score = 100 - (critical×4 + serious×3 + moderate×2 + minor×1) × 8
 */
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
//  These metrics are captured DURING a single test run and saved as a JSON
//  attachment on the test result. Each test gets its own separate attachment.
// ---------------------------------------------------------------------------

/**
 * Metrics captured by `observability.fixture.ts` during a single test run.
 *
 * This is the "raw" per-test data. The fixture:
 *  1. Listens to network events (request, response, etc.) → requestCount, responseTimes
 *  2. Captures console.error() and window.onerror → consoleErrors, pageErrors
 *  3. Runs accessibility scan after the test → accessibility
 *  4. Records timing → testStartedAt, testEndedAt, testDurationMs
 *
 * This data is serialised to JSON and attached to the test result, then read
 * by the observability-reporter.ts and UniversalReporter.ts.
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
//  These types are produced by the observability-reporter.ts AFTER all tests
//  have finished. They combine Playwright metadata (status, retry, project)
//  with the raw fixture metrics into a single enriched structure.
// ---------------------------------------------------------------------------

/**
 * Per-test entry in the aggregated observability summary.
 *
 * This is the "enriched" version of FixtureObservabilityMetrics — it includes
 * Playwright metadata (test ID, title, file, project, status, outcome, retry)
 * that the fixture doesn't have access to. The observability-reporter.ts
 * creates these entries by combining Playwright's TestCase/TestResult with
 * the fixture's metrics attachment.
 *
 * Example: A test in the fixture produces { requestCount: 45, ... }.
 * The reporter wraps it into TestObservabilityEntry adding
 * { id: 'abc123', title: 'chromium > Suite > test name', status: 'passed', ... }.
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
 * Top-level observability summary written to `Reports/observability/observability-metrics.json`.
 *
 * This is the MAIN OUTPUT of the entire observability pipeline:
 *  1. Fixture captures per-test metrics → JSON attachment
 *  2. Reporter reads attachments → builds TestObservabilityEntry array
 *  3. Reporter aggregates → writes this ObservabilitySummary to disk
 *  4. Benchmark script reads this JSON → generates 3D dashboard
 *
 * The `overall` section has aggregate stats across all tests.
 * The `accessibilityOverall` section has aggregate a11y counts.
 * The `tests` array has detailed per-test entries sorted by duration (longest first).
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
