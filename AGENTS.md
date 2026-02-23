# AGENTS.md

This guide is for juniors and beginners writing tests in this framework.

## Read first
1. `PROJECT-ARCHITECTURE.md` — **complete architecture guide** (data flow, fixture chain, file-by-file explanations)
2. `walkthrough.md` — how the framework works step by step
3. `PACKAGE-SCRIPTS-GUIDE.md` — every npm script and dependency explained
4. `README.md` — setup, commands, report explanations

## Main rules
1. Follow **Page Object Model** strictly — all selectors in `pages/`, all test logic in `tests/`.
2. Keep selectors in `pages/` only — never use raw locators in spec files.
3. Keep test logic in `tests/` only — page objects handle actions + assertions.
4. Keep each test focused on **one behavior** (one clear thing to verify).
5. Use clear, descriptive test names.
6. Accessibility is checked automatically — you don't need to add a11y assertions manually.

## Folder responsibility
| Folder / File | Purpose |
|---------------|---------|
| `tests/` | Test scenarios only (import fixtures, call page object methods) |
| `pages/` | Locators + actions + assertions (Page Object classes) |
| `fixtures/test.fixture.ts` | Injects page objects into tests |
| `fixtures/observability.fixture.ts` | Auto-captures network metrics, errors & accessibility per test |
| `observability/types.ts` | TypeScript types for metrics & accessibility data |
| `reporters/UniversalReporter.ts` | Generates the 7-tab Universal Report HTML |

## Run and report (single command)
Use **one command** for full execution + both reports:
```bash
npm run reports
```

This runs: clean → tests → reports generated automatically.

All outputs are available in `Reports/`:
| Report | Path |
|--------|------|
| Playwright HTML | `Reports/playwright-html/index.html` |
| Universal Report | `Reports/universal-report/index.html` |
| Failure artifacts | `Reports/test-results/` |

## Test writing template
```ts
import { test } from '../fixtures/test.fixture';

test.describe('Feature name', () => {
  test.beforeEach(async ({ docsPage }) => {
    await docsPage.open();
  });

  test('does one important check', async ({ docsPage }) => {
    await docsPage.assertTitleAndMainHeading();
  });
});
```

## What gets captured automatically (no code needed)
Every test automatically collects:
- ✅ Network request count, failures, response times
- ✅ Console errors and page crashes
- ✅ Test duration and timing
- ✅ **Accessibility scan** — checks for missing alt text, empty buttons, heading order, form labels, missing landmarks, and more

All of this flows into the Universal Report automatically.

## Definition of done
- [ ] Test passes locally (`npm run reports`)
- [ ] Test uses POM (no raw selectors in the spec file)
- [ ] `npm run reports` completes and generates both reports in `Reports/`
- [ ] No new critical/serious accessibility violations introduced
