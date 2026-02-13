import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Reporter, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import type {
  AccessibilityScanResult,
  FixtureObservabilityMetrics,
  ObservabilitySummary,
  TestObservabilityEntry
} from '../observability/types';

const OUTPUT_DIR = path.resolve(process.cwd(), 'Reports/observability');
const OUTPUT_FILE = path.resolve(OUTPUT_DIR, 'observability-metrics.json');

const EMPTY_A11Y: AccessibilityScanResult = {
  totalViolations: 0,
  critical: 0,
  serious: 0,
  moderate: 0,
  minor: 0,
  violations: []
};

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

function resolveProjectName(test: TestCase): string {
  const fromSuite = (test.parent as { project?: () => { name: string } | undefined } | undefined)
    ?.project?.()
    ?.name;
  if (fromSuite) {
    return fromSuite;
  }

  const firstPathSegment = test.titlePath()[0];
  if (firstPathSegment && ['chromium', 'firefox', 'webkit'].includes(firstPathSegment.toLowerCase())) {
    return firstPathSegment.toLowerCase();
  }

  const fullTitle = test.titlePath().find((segment) => segment.startsWith('[') && segment.endsWith(']'));
  if (!fullTitle) {
    return 'default';
  }
  return fullTitle.slice(1, -1);
}

async function readMetricsAttachment(result: TestResult): Promise<FixtureObservabilityMetrics | undefined> {
  const attachment = result.attachments.find((item) => item.name === 'observability-metrics' && item.path);
  if (!attachment?.path) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(attachment.path, 'utf-8');
    return JSON.parse(raw) as FixtureObservabilityMetrics;
  } catch {
    return undefined;
  }
}

class ObservabilityReporter implements Reporter {
  private readonly runId = new Date().toISOString().replace(/[:.]/g, '-');
  private readonly testsById = new Map<string, TestObservabilityEntry>();

  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const metrics = await readMetricsAttachment(result);
    const responseTimes = metrics?.responseTimesMs ?? [];
    const maxResponseTimeMs = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const titlePath = test.titlePath().filter(Boolean);

    const entry: TestObservabilityEntry = {
      id: test.id,
      title: titlePath.join(' > ') || test.title,
      file: test.location.file,
      projectName: resolveProjectName(test),
      status: result.status,
      outcome: test.outcome(),
      durationMs: result.duration,
      retry: result.retry,
      startedAt: result.startTime.toISOString(),
      requestCount: metrics?.requestCount ?? 0,
      requestFailureCount: metrics?.requestFailureCount ?? 0,
      responseErrorCount: metrics?.responseErrorCount ?? 0,
      avgResponseTimeMs: metrics?.avgResponseTimeMs ?? 0,
      p95ResponseTimeMs: metrics?.p95ResponseTimeMs ?? 0,
      maxResponseTimeMs,
      consoleErrorCount: metrics?.consoleErrors.length ?? 0,
      pageErrorCount: metrics?.pageErrors.length ?? 0,
      accessibility: metrics?.accessibility ?? EMPTY_A11Y
    };

    this.testsById.set(test.id, entry);
  }

  async onEnd(result: FullResult): Promise<void> {
    const tests = Array.from(this.testsById.values()).sort((left, right) => right.durationMs - left.durationMs);
    const totalTests = tests.length;
    const passed = tests.filter((item) => item.status === 'passed').length;
    const failed = tests.filter((item) => item.status === 'failed').length;
    const skipped = tests.filter((item) => item.status === 'skipped').length;
    const timedOut = tests.filter((item) => item.status === 'timedOut').length;
    const flaky = tests.filter((item) => item.outcome === 'flaky').length;
    const totalRequests = tests.reduce((sum, item) => sum + item.requestCount, 0);
    const requestFailures = tests.reduce((sum, item) => sum + item.requestFailureCount, 0);

    // Aggregate accessibility data
    const a11yOverall = {
      totalViolations: tests.reduce((sum, t) => sum + t.accessibility.totalViolations, 0),
      critical: tests.reduce((sum, t) => sum + t.accessibility.critical, 0),
      serious: tests.reduce((sum, t) => sum + t.accessibility.serious, 0),
      moderate: tests.reduce((sum, t) => sum + t.accessibility.moderate, 0),
      minor: tests.reduce((sum, t) => sum + t.accessibility.minor, 0),
      testsWithViolations: tests.filter((t) => t.accessibility.totalViolations > 0).length,
      testsScanned: tests.length
    };

    const summary: ObservabilitySummary = {
      generatedAt: new Date().toISOString(),
      runId: this.runId,
      overall: {
        totalTests,
        passed,
        failed,
        skipped,
        timedOut,
        flaky,
        avgTestDurationMs: round(average(tests.map((item) => item.durationMs))),
        totalRequests,
        requestFailures,
        requestFailureRatePct: totalRequests === 0 ? 0 : round((requestFailures / totalRequests) * 100),
        avgResponseTimeMs: round(average(tests.map((item) => item.avgResponseTimeMs).filter((value) => value > 0))),
        p95ResponseTimeMs: round(percentile(tests.map((item) => item.p95ResponseTimeMs).filter((value) => value > 0), 95))
      },
      accessibilityOverall: a11yOverall,
      tests
    };

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf-8');

    console.log(`\n[observability] Metrics written to ${OUTPUT_FILE}`);
    console.log(`[observability] Accessibility: ${a11yOverall.totalViolations} violations (${a11yOverall.critical} critical, ${a11yOverall.serious} serious)`);
    console.log(`[observability] Playwright run status: ${result.status}\n`);
  }
}

export default ObservabilityReporter;
