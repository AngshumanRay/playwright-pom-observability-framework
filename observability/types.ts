/** A single accessibility violation found on the page. */
export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  helpUrl: string;
  nodes: number;
}

/** Summary of an accessibility scan for one test. */
export interface AccessibilityScanResult {
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  violations: AccessibilityViolation[];
}

export interface FixtureObservabilityMetrics {
  requestCount: number;
  requestFailureCount: number;
  responseErrorCount: number;
  responseTimesMs: number[];
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  consoleErrors: string[];
  pageErrors: string[];
  testStartedAt: string;
  testEndedAt: string;
  testDurationMs: number;
  accessibility: AccessibilityScanResult;
}

export interface TestObservabilityEntry {
  id: string;
  title: string;
  file: string;
  projectName: string;
  status: string;
  outcome: string;
  durationMs: number;
  retry: number;
  startedAt: string;
  requestCount: number;
  requestFailureCount: number;
  responseErrorCount: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  maxResponseTimeMs: number;
  consoleErrorCount: number;
  pageErrorCount: number;
  accessibility: AccessibilityScanResult;
}

export interface ObservabilitySummary {
  generatedAt: string;
  runId: string;
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
  accessibilityOverall: {
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    testsWithViolations: number;
    testsScanned: number;
  };
  tests: TestObservabilityEntry[];
}
