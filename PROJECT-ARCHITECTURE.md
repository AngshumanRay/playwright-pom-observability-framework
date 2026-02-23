# 🏗️ Project Architecture — Complete Guide

> **Purpose of this document:**  
> Explain every single file, every connection, every data flow, and every concept
> in this project so that you can confidently walk a customer through it.

---

## 📌 What Is This Project?

This is a **Playwright + TypeScript** end-to-end testing framework that goes far beyond basic testing.  
It automatically captures:

| Capability | What It Does |
|---|---|
| **Page Object Model (POM)** | Keeps selectors in `pages/` and test logic in `tests/` — clean separation |
| **Network Observability** | Counts every HTTP request, tracks failures, measures response times |
| **Error Tracking** | Captures `console.error()` calls and unhandled JavaScript exceptions |
| **Accessibility Scanning** | Checks 8 WCAG rules on every page after every test — no code needed |
| **2 Report Formats** | Playwright HTML Report + 7-Tab Universal Report |

The test author writes **zero extra code** — all observability is injected automatically via fixtures.

---

## 🗂️ Folder Structure Explained

```
project-root/
│
├── package.json                    ← NPM scripts & dependencies
├── tsconfig.json                   ← TypeScript compiler settings
├── playwright.config.ts            ← Central config: browsers, reporters, timeouts
│
├── observability/
│   └── types.ts                    ← Shared TypeScript interfaces (data shapes)
│
├── fixtures/
│   ├── observability.fixture.ts    ← AUTO-FIXTURE: captures network, errors, a11y
│   └── test.fixture.ts             ← Injects page objects (POM) into tests
│
├── pages/
│   └── GettingStartedVscodePage.ts ← Page Object class (selectors + assertions)
│
├── tests/
│   └── getting-started-vscode.spec.ts ← 5 test scenarios (uses POM methods only)
│
├── reporters/
│   └── UniversalReporter.ts        ← Generates 7-tab HTML report
│
├── Reports/                        ← ALL output goes here
│   ├── playwright-html/            ← Playwright's built-in HTML report
│   ├── universal-report/           ← 7-tab Universal Report HTML
│   └── test-results/               ← Screenshots, videos, traces per test
│
├── AGENTS.md                       ← Quick rules for writing tests
├── README.md                       ← Setup & usage guide
├── walkthrough.md                  ← Beginner walkthrough
└── PROJECT-ARCHITECTURE.md         ← THIS FILE — full architecture guide
```

---

## 🔗 How Everything Connects (Data Flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        1. TEST EXECUTION                            │
│                                                                     │
│  tests/*.spec.ts                                                    │
│       │                                                             │
│       │ imports `test` from                                         │
│       ▼                                                             │
│  fixtures/test.fixture.ts                                           │
│       │                                                             │
│       │ extends                                                     │
│       ▼                                                             │
│  fixtures/observability.fixture.ts   ◄── uses types from            │
│       │                                  observability/types.ts     │
│       │ extends                                                     │
│       ▼                                                             │
│  @playwright/test (base)                                            │
│                                                                     │
│  What happens during each test:                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 1. observability.fixture.ts attaches event listeners        │   │
│  │    (request, requestfinished, requestfailed, response,      │   │
│  │     console, pageerror)                                     │   │
│  │ 2. test.fixture.ts creates a GettingStartedVscodePage(page) │   │
│  │ 3. The test runs (calls POM methods like docsPage.open())   │   │
│  │ 4. After test: a11y scan runs on the page                   │   │
│  │ 5. Metrics saved as JSON attachment on test result           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ attachments
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      2. REPORTERS (run after tests)                 │
│                                                                     │
│  ┌─ Playwright built-in reporters ─────────────────────────────┐   │
│  │  • list        → console output                              │   │
│  │  • html        → Reports/playwright-html/index.html          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Custom reporter: UniversalReporter.ts ─────────────────────┐   │
│  │  • Reads observability-metrics attachment from each test      │   │
│  │  • Also reads a11y data from the attachment                   │   │
│  │  • Also reads screenshot attachments (base64 encoded)         │   │
│  │  • Computes scores, tiers, security analysis                  │   │
│  │  • Generates Reports/universal-report/index.html (7 tabs)     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📖 File-by-File Explanation

### 1. `playwright.config.ts` — The Brain

**What:** Central configuration that Playwright reads when you run `playwright test`.

**Key decisions made here:**
- **`testDir: './tests'`** — Only look for test files in the `tests/` folder
- **`workers: 1`** — Run tests one at a time (sequential) for stable benchmark metrics
- **`retries: 1`** — If a test fails, retry it once before marking it failed
- **`timeout: 45_000`** — Each test gets 45 seconds max
- **3 reporters** — list (console), HTML, UniversalReporter
- **`screenshot: 'on'`, `video: 'on'`, `trace: 'on'`** — Always capture everything
- **2 browser projects** — Chromium + Firefox (each test runs in both)

**Why it matters:** This single file controls HOW tests run, WHAT gets captured, and WHERE reports go.

---

### 2. `observability/types.ts` — The Data Dictionary

**What:** Shared TypeScript interfaces that define the shape of ALL observability data.

**Key types:**
| Interface | Used By | Purpose |
|---|---|---|
| `AccessibilityViolation` | fixture, reporters | One a11y rule violation (id, impact, description, node count) |
| `AccessibilityScanResult` | fixture, reporters | Summary of all violations for one test (counts by severity) |
| `FixtureObservabilityMetrics` | fixture → reporter | Per-test data written by the auto-fixture (requests, errors, a11y, timing) |
| `TestObservabilityEntry` | reporter | Enriched per-test entry with Playwright metadata (status, retry, project) |
| `ObservabilitySummary` | reporter → script | Final aggregated JSON file with overall stats + all test entries |

**Why it matters:** These types are the "contract" between the fixture (producer) and the reporters/scripts (consumers). If you add a new metric, you add it here first.

---

### 3. `fixtures/observability.fixture.ts` — The Invisible Engine

**What:** An **auto-fixture** (`{ auto: true }`) that runs for EVERY test without the test author writing any code.

**How it works (lifecycle):**

```
BEFORE TEST:
  ┌─ Attach event listeners to `page` ──────────────────────┐
  │  page.on('request')        → count requests              │
  │  page.on('requestfinished')→ measure response time        │
  │  page.on('requestfailed')  → count network failures       │
  │  page.on('response')       → count HTTP 4xx/5xx           │
  │  page.on('console')        → capture console.error()      │
  │  page.on('pageerror')      → capture unhandled JS errors  │
  └──────────────────────────────────────────────────────────┘

DURING TEST:
  └─ Listeners silently accumulate data in background ──────┘

AFTER TEST:
  ┌─ Run accessibility scan ────────────────────────────────┐
  │  8 WCAG rules checked via page.evaluate() in browser:   │
  │  1. img without alt text      (critical)                 │
  │  2. button without text       (critical)                 │
  │  3. link without text         (serious)                  │
  │  4. missing <html lang>       (serious)                  │
  │  5. input without label       (critical)                 │
  │  6. skipped heading levels    (moderate)                 │
  │  7. low contrast text         (serious)                  │
  │  8. missing <main> landmark   (moderate)                 │
  └──────────────────────────────────────────────────────────┘
  ┌─ Build FixtureObservabilityMetrics object ──────────────┐
  │  Save as JSON file → attach to test result               │
  │  (reporters read this attachment later)                   │
  └──────────────────────────────────────────────────────────┘
```

**Key concept — `{ auto: true }`:**  
In Playwright, fixtures with `auto: true` run automatically for every test. The test doesn't need to request this fixture — it just happens. This is what makes the observability "invisible" to the test author.

**Key concept — Fixture Chain:**
```
@playwright/test (provides `page`, `browser`, etc.)
      ↓ extended by
observability.fixture.ts (adds `observabilityAuto` auto-fixture)
      ↓ extended by
test.fixture.ts (adds `docsPage` page object)
      ↓ imported by
tests/*.spec.ts (uses `docsPage` in tests)
```

---

### 4. `fixtures/test.fixture.ts` — The Bridge

**What:** Connects page objects (POM) to tests by extending the observability fixture.

**What it does:**
1. Imports `test` from `observability.fixture.ts` (NOT from `@playwright/test`)
2. Extends it with `AppFixtures` type: `{ docsPage: GettingStartedVscodePage }`
3. Creates a new `GettingStartedVscodePage(page)` instance for each test
4. Exports `test` and `expect` for test files to import

**Why tests import from here:**
```typescript
// ❌ WRONG — no observability, no page objects
import { test } from '@playwright/test';

// ✅ CORRECT — gets observability + page objects automatically
import { test } from '../fixtures/test.fixture';
```

---

### 5. `pages/GettingStartedVscodePage.ts` — The Page Object

**What:** Page Object Model (POM) class for the Playwright docs "Getting Started — VS Code" page.

**Pattern:**
- **Constructor** — Sets up locators (sidebar, TOC links)
- **`open()`** — Navigates to the page
- **`assert*()` methods** — Verify specific things on the page

**Methods:**
| Method | What It Checks |
|---|---|
| `open()` | Navigates to `/docs/getting-started-vscode` |
| `assertTitleAndMainHeading()` | Page title + H1 heading match expected text |
| `assertTopSections()` | 6 top-level H2 sections are visible |
| `assertCoreSubSections()` | 5 H3 sub-sections under "Core Features" visible |
| `assertSidebarLinks()` | Left sidebar has expected navigation links |
| `assertTocAnchorsResolve()` | TOC links point to real DOM sections |

**Why POM matters:**  
If the website changes a CSS selector, you fix it in ONE place (the page object), not in every test.

---

### 6. `tests/getting-started-vscode.spec.ts` — The Tests

**What:** 5 test scenarios that verify the Playwright docs page.

**Structure:**
```typescript
test.describe('Playwright docs - getting started with VS Code', () => {
  test.beforeEach(async ({ docsPage }) => {
    await docsPage.open();          // Navigate before each test
  });

  test('test name', async ({ docsPage }) => {
    await docsPage.assertSomething(); // Call POM method
  });
});
```

**Key rules:**
- Tests import `test` from `fixtures/test.fixture.ts`
- Tests NEVER use raw selectors — only POM methods
- `docsPage` is injected automatically via the fixture
- Observability is captured automatically — no code needed

**Each test runs in BOTH browsers (Chromium + Firefox) = 10 total test executions.**

---

### 7. `reporters/UniversalReporter.ts` — The Mega Report

**What:** Self-contained reporter that generates a comprehensive 7-tab HTML report.

**7 Tabs:**
| Tab | What's In It |
|---|---|
| 📈 **Dashboard** | KPI cards, donut chart, bar chart, tier distribution |
| 🧪 **Tests** | Expandable test list with steps, screenshots, errors, a11y violations |
| ⚡ **Performance** | 3D scatter, box plot, histogram, slowest tests |
| 🔭 **Observability** | Network requests, response times, console/page errors per test |
| 🔒 **Security** | HTTP error analysis, security findings, risk assessment |
| ♿ **Accessibility** | Violation breakdown, severity pie chart, WCAG rules |
| 🌐 **Browsers** | Radar chart, pass rate comparison, browser table |

**How it works:**
1. `onTestEnd()` — Collects test data, reads observability + a11y attachments, base64-encodes screenshots
2. `onEnd()` — Builds the payload (summary, observability, security, a11y, browsers), generates HTML
3. Writes `Reports/universal-report/index.html`

**Key feature:** This reporter is STANDALONE. Drop it into any Playwright project and it works.

---

### 8. `package.json` — NPM Scripts

| Script | What It Does |
|---|---|
| `npm run clean:reports` | Deletes all old report folders |
| `npm run test` | Runs all Playwright tests |
| `npm run reports` | **THE ONE COMMAND** — clean → test → both reports generated automatically |
| `npm run report:playwright` | Opens Playwright HTML report in browser |
| `npm run report:open:all` | Opens both reports in browser |

---

### 9. `tsconfig.json` — TypeScript Settings

| Setting | Value | Why |
|---|---|---|
| `target` | ES2022 | Modern JavaScript features |
| `module` | CommonJS | Node.js compatibility |
| `strict` | true | Catch errors at compile time |
| `types` | node, @playwright/test | Type definitions available everywhere |

---

## 🧩 The Fixture Chain Explained

This is the most important concept to understand:

```
@playwright/test              ← Base Playwright (provides page, browser, context)
       │
       │ extended by
       ▼
observability.fixture.ts      ← Adds auto-fixture that captures metrics
       │                          - Network listeners (request, response, etc.)
       │                          - Error listeners (console, pageerror)
       │                          - Accessibility scan (runs after each test)
       │                          - Saves metrics as JSON attachment
       │ extended by
       ▼
test.fixture.ts               ← Adds page objects for dependency injection
       │                          - docsPage → GettingStartedVscodePage instance
       │
       │ imported by
       ▼
tests/*.spec.ts               ← Tests use `docsPage` — everything else is auto
```

**Why this chain matters:**
- Each level adds functionality without modifying the others
- Test authors only see the top layer (`docsPage.open()`, `docsPage.assertTopSections()`)
- All the instrumentation happens underneath, invisibly

---

## 📊 Report Outputs (2 Reports)

| # | Report | File | Generated By |
|---|---|---|---|
| 1 | Playwright HTML | `Reports/playwright-html/index.html` | Playwright built-in |
| 2 | Universal Report (7 tabs) | `Reports/universal-report/index.html` | `reporters/UniversalReporter.ts` |

---

## 🚀 How to Run (One Command)

```bash
npm run reports
```

This single command:
1. Cleans old report artifacts
2. Runs all Playwright tests (Chromium + Firefox = 10 test executions)
3. Both reports (Playwright HTML + Universal Report) are generated automatically during the test run

---

## 📝 How to Add a New Test

1. **Add a method to the page object** (`pages/GettingStartedVscodePage.ts`)
2. **Call that method from the spec file** (`tests/getting-started-vscode.spec.ts`)
3. **Never use raw selectors in spec files** — always go through the POM
4. **Run `npm run reports`** — all observability and reports are automatic

---

## 🔑 Key Concepts for Customer Explanation

### "Why Auto-Fixtures?"
Traditional testing requires you to add monitoring code to every test. Auto-fixtures mean the monitoring attaches itself to every test automatically. Test authors focus on testing; observability happens in the background.

### "Why Page Object Model?"
If a website changes its layout, you fix ONE file (the page object), not dozens of test files. It's a separation of concerns — selectors and assertions in one place, test scenarios in another.

### "Why 2 Reports?"
Each report serves a different audience:
- **Playwright HTML** — Developers debugging a specific failing test (traces, screenshots, videos)
- **Universal Report** — Everyone — one report with everything in 7 tabs (Dashboard, Tests, Performance, Accessibility, Observability, Security, Glossary)

### "What Makes This Framework Different?"
1. **Zero-code observability** — Network, errors, accessibility captured automatically
2. **Built-in accessibility scanning** — No axe-core dependency, runs in browser
3. **Multiple report formats** — One command generates everything
4. **Portable** — The UniversalReporter works in ANY Playwright project

---

## 📋 Recommended Reading Order

For someone new to this project, read the files in this order:

1. `package.json` → Understand what commands are available
2. `playwright.config.ts` → Understand the configuration
3. `observability/types.ts` → Understand the data shapes
4. `fixtures/observability.fixture.ts` → Understand auto-instrumentation
5. `fixtures/test.fixture.ts` → Understand fixture chaining
6. `pages/GettingStartedVscodePage.ts` → Understand POM pattern
7. `tests/getting-started-vscode.spec.ts` → Understand test structure
8. `reporters/UniversalReporter.ts` → Understand report generation
