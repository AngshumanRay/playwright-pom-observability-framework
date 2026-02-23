# Playwright POM Framework

A Playwright + TypeScript test framework with:
- **Page Object Model (POM)** — selectors & actions live in `pages/`, tests live in `tests/`
- **5 core test cases** for the VS Code getting-started docs page
- **Observability metrics** — network requests, errors, response times captured automatically
- **Accessibility scanning** — every page is scanned for WCAG violations (missing alt text, empty buttons, heading order, etc.)
- **2 reports generated in one command** — all output goes to `Reports/`

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
3. Generates the **Playwright HTML Report** (built-in)
4. Generates the **Universal Report** (7-tab HTML with Dashboard, Tests, Performance, Accessibility, Observability, Security, Glossary)

## Reports Location
All output lives under `Reports/`:

```text
Reports/
├── playwright-html/          ← Playwright's built-in HTML report
│   └── index.html
├── universal-report/         ← 7-tab Universal Report
│   └── index.html
└── test-results/             ← Screenshots, videos, traces
```

## Open Reports
**Both reports at once:**
```bash
npm run report:open:all
```

**Playwright HTML only:**
```bash
npm run report:playwright
```

**Universal Report only:**
Open `Reports/universal-report/index.html` in any browser.

## What's in the Universal Report?

The Universal Report has **7 tabs**:

### 1. Dashboard
Overall benchmark score (0–100), tier (Elite/Strong/Stable/Watch/Critical), KPI cards, and summary charts.

### 2. Tests
Per-test results with embedded screenshots, status, duration, and error details.

### 3. Performance
| Metric | What it means |
|--------|---------------|
| **Benchmark Score** | Combined score (0–100) from speed, reliability, quality, throughput & accessibility |
| **Pass Rate** | % of tests that passed |
| **Throughput** | Tests completed per minute |
| **Median / P95 / P99** | Duration percentiles — P99 = worst-case slow test |
| **CV%** | Consistency metric — lower = more predictable run times |

### 4. Accessibility
| Metric | What it means |
|--------|---------------|
| **Accessibility Score** | 0–100 score based on violations found (fewer = better) |
| **Violations by Impact** | Breakdown into Critical, Serious, Moderate, Minor |
| **Top Violations** | Most frequent issues (e.g., `image-alt`, `button-name`, `heading-order`) |

### 5. Observability
Network request counts, failure rates, response times, console errors, page errors.

### 6. Security
Security analysis with risk assessment and findings.

### 7. Glossary
Plain-English explanations of every metric for non-technical stakeholders.

## Framework Structure
```text
pages/          → Page Object classes (selectors + actions + assertions)
fixtures/       → Fixture wiring + observability hooks + accessibility scanning
tests/          → Test specs (scenario-only, no raw selectors)
reporters/      → Universal Report generator
observability/  → TypeScript types for metrics
```

## Beginner Docs
- `PROJECT-ARCHITECTURE.md` — **START HERE** — complete architecture guide with data flow diagrams and file-by-file explanations
- `PACKAGE-SCRIPTS-GUIDE.md` — explains every npm script and dependency
- `walkthrough.md` — step-by-step guide to understanding the framework

> 💡 **Every source file is heavily commented** with architecture explanations, data flow
> diagrams, "WHY" documentation, and how each file connects to the rest of the system.
