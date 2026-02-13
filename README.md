# Playwright POM Framework

A Playwright + TypeScript test framework with:
- **Page Object Model (POM)** — selectors & actions live in `pages/`, tests live in `tests/`
- **5 core test cases** for the VS Code getting-started docs page
- **Observability metrics** — network requests, errors, response times captured automatically
- **Accessibility scanning** — every page is scanned for WCAG violations (missing alt text, empty buttons, heading order, etc.)
- **3 reports generated in one command** — all output goes to `Reports/`

## Setup
```bash
npm install
npx playwright install
```

## Run Everything (One Command)
```bash
npm run reports
```

This single command:
1. Cleans old report artifacts
2. Runs all Playwright tests (Chromium + Firefox)
3. Generates the **Observability & Performance Benchmark Report** (with accessibility data)
4. Generates the **Allure HTML Report**
5. Keeps the **Playwright HTML Report** ready

## Reports Location
All output lives under `Reports/`:

```text
Reports/
├── playwright-html/          ← Playwright's built-in HTML report
│   └── index.html
├── allure-report/            ← Allure HTML report
│   └── index.html
├── observability/
│   ├── observability-metrics.json    ← Raw JSON metrics
│   └── performance-benchmark-report.html  ← Performance + Accessibility dashboard
├── allure-results/           ← Raw Allure result files
└── test-results/             ← Failure screenshots, videos, traces
```

## Open Reports
**Playwright HTML:**
```bash
npm run report:playwright
```

**Allure HTML:**
```bash
npm run report:allure:open
```

**Performance + Accessibility Dashboard:**
Open `Reports/observability/performance-benchmark-report.html` in any browser.

## What's in the Performance + Accessibility Report?

### Performance Section
| Metric | What it means |
|--------|---------------|
| **Benchmark Score** | Combined score (0–100) from speed, reliability, quality, throughput & accessibility |
| **Benchmark Tier** | Grade: Elite (90+), Strong (75+), Stable (60+), Watch (40+), Critical (<40) |
| **Pass Rate** | % of tests that passed |
| **Throughput** | Tests completed per minute |
| **Median / P95 / P99** | Duration percentiles — P99 = worst-case slow test |
| **CV%** | Consistency metric — lower = more predictable run times |
| **Request Failure Rate** | Failed network requests / total requests |
| **Error Signals** | Combined count of request + HTTP + console + page errors |

### Accessibility Section
| Metric | What it means |
|--------|---------------|
| **Accessibility Score** | 0–100 score based on violations found (fewer = better) |
| **Violations by Impact** | Breakdown into Critical, Serious, Moderate, Minor |
| **Top Violations** | Most frequent issues (e.g., `image-alt`, `button-name`, `heading-order`) |
| **Pages with Issues** | How many test pages had at least one violation |

### Charts
- **3D Test Benchmark Cloud** — each dot = one test (size = error count)
- **3D Browser Comparison** — bubble size = benchmark score
- **Radar Chart** — 5 dimensions: Speed, Reliability, Quality, Throughput, Accessibility
- **Duration Box Plot** — min/median/max spread per browser
- **Tier Distribution** — pie chart of quality tiers
- **Throughput vs Pass Rate** — bar + line combo
- **Top 10 Slowest Tests** — bottleneck candidates

## Framework Structure
```text
pages/          → Page Object classes (selectors + actions + assertions)
fixtures/       → Fixture wiring + observability hooks + accessibility scanning
tests/          → Test specs (scenario-only, no raw selectors)
reporters/      → Custom observability reporter
scripts/        → Benchmark report generator
observability/  → TypeScript types for metrics
```

## Beginner Docs
- `AGENTS.md` — simple rules for writing tests
- `walkthrough.md` — step-by-step guide to understanding the framework
