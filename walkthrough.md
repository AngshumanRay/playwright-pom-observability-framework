# Walkthrough

A step-by-step guide to understanding and using this framework. Written for beginners.

## 1) What this framework gives you
- **POM-based** test structure (selectors in `pages/`, logic in `tests/`)
- **Automatic observability** — every test captures network metrics, errors and timing
- **Automatic accessibility scanning** — every page is checked for WCAG violations
- **3 report outputs** from a single command:
  1. Playwright HTML report (built-in)
  2. Allure report (detailed history & categories)
  3. Performance + Accessibility benchmark dashboard (3D charts, KPI cards, violation list)

## 2) Get started
Install once:
```bash
npm install
npx playwright install
```

Run everything with **one command**:
```bash
npm run reports
```

This command does: clean → test → generate benchmark report → generate Allure report.

## 3) Where to see results
| Report | Location |
|--------|----------|
| Playwright HTML | `Reports/playwright-html/index.html` |
| Allure HTML | `Reports/allure-report/index.html` |
| Benchmark Dashboard | `Reports/observability/performance-benchmark-report.html` |
| Raw metrics JSON | `Reports/observability/observability-metrics.json` |
| Failure traces/screenshots/videos | `Reports/test-results/` |

## 4) File reading order (recommended)
Read these files in this order to understand the framework:

1. **`PROJECT-ARCHITECTURE.md`** — START HERE — full architecture guide with data flow diagrams
2. **`PACKAGE-SCRIPTS-GUIDE.md`** — explains every npm script and dependency
3. **`package.json`** — npm scripts (how to run things)
4. **`tsconfig.json`** — TypeScript compiler options (fully commented with explanations)
5. **`playwright.config.ts`** — browsers, reporters, timeouts (heavily commented)
6. **`observability/types.ts`** — data shapes (metrics + accessibility types, with data flow docs)
7. **`fixtures/observability.fixture.ts`** — auto-captures network, errors, accessibility per test
8. **`fixtures/test.fixture.ts`** — injects page objects into tests (with fixture chain diagram)
9. **`pages/GettingStartedVscodePage.ts`** — selectors + reusable methods (POM pattern explained)
10. **`tests/getting-started-vscode.spec.ts`** — 5 test scenarios (per-test WHY explanations)
11. **`reporters/observability-reporter.ts`** — aggregates metrics into JSON (pipeline docs)
12. **`reporters/UniversalReporter.ts`** — generates 7-tab HTML report (section-level docs)
13. **`scripts/generate-performance-benchmark-report.ts`** — builds the 3D benchmark HTML dashboard

> 💡 **Every file is heavily commented with architecture explanations, data flow diagrams,
> and "WHY" documentation.** You can read any file and understand its purpose, how it
> connects to other files, and how data flows through the system.

## 5) How to add a new test
1. Add a new method in the page object (`pages/...Page.ts`) first.
2. Call that method from a spec file (`tests/...spec.ts`).
3. **Never** use raw selectors in spec files — always go through the page object.
4. Run:
   ```bash
   npm run reports
   ```
5. Check all three reports under `Reports/`.

## 6) Understanding the benchmark report

### KPI Cards (top section)
- **Benchmark Score** — overall health (0–100). Combines speed + reliability + quality + throughput + accessibility.
- **Pass Rate** — what % of tests passed. Green = good, red = bad.
- **Median Duration** — typical test time. Lower is better.
- **P99 Duration** — worst-case test time (only 1% are slower).
- **CV%** — consistency. Low = predictable. High = flaky timing.
- **Throughput** — tests per minute.

### Accessibility Section
- **Accessibility Score** — 0–100. Fewer violations = higher score.
- **Violations by Impact** — Critical > Serious > Moderate > Minor.
- **Top Violations** — most common issues like missing alt text, empty buttons, heading order.
- Fix **critical** and **serious** issues first.

### Charts
- **3D Test Cloud** — drag to rotate, scroll to zoom. Each dot is a test.
- **Radar Chart** — compares browsers across 5 dimensions.
- **Box Plot** — shows duration spread per browser.
- **Tier Pie** — how many tests are Elite/Strong/Stable/Watch/Critical.

## 7) Debug checklist
1. Open the Playwright HTML report first — it shows pass/fail clearly.
2. Look at traces/videos in `Reports/test-results/` for failing tests.
3. Check the benchmark dashboard for performance regressions or new accessibility violations.
4. Validate selectors in the page object if a test can't find an element.
5. Re-run with `npm run reports` after fixing.

## 8) Documentation files summary
| File | What it explains |
|------|-----------------|
| `PROJECT-ARCHITECTURE.md` | Full architecture guide — folder structure, data flow diagrams, fixture chain, report outputs, how to add tests, key concepts for customer explanation |
| `PACKAGE-SCRIPTS-GUIDE.md` | Every npm script explained, all dependencies explained with purpose |
| `AGENTS.md` | Quick rules for test writers (POM rules, folder responsibilities, definition of done) |
| `UNIVERSAL-REPORT-WALKTHROUGH.md` | Deep-dive into the 7-tab Universal Report (if present) |
| `walkthrough.md` | This file — step-by-step understanding guide |
| `README.md` | Quick setup + report reference |

> 💡 **For customer presentations**, start with `PROJECT-ARCHITECTURE.md` — it has everything
> needed to explain the framework's design, data flow, and value proposition.
