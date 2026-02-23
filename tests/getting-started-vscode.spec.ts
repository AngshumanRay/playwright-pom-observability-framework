/**
 * @file getting-started-vscode.spec.ts
 * @description End-to-end test scenarios for the Playwright "Getting Started — VS Code" docs page.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  THIS IS THE ONLY TEST FILE IN THE PROJECT.                            ║
 * ║  It contains 5 test scenarios, each focusing on ONE behavior.          ║
 * ║                                                                        ║
 * ║  With 2 browser projects (Chromium + Firefox), Playwright runs each   ║
 * ║  test in BOTH browsers = 10 total test executions per run.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * KEY DESIGN RULES (Page Object Model):
 *  1. Tests import `test` from `fixtures/test.fixture.ts` — NEVER from @playwright/test
 *  2. Tests NEVER use raw selectors like `page.locator('.my-class')`
 *  3. All interactions go through the Page Object: `docsPage.methodName()`
 *  4. Each test verifies ONE behavior (single responsibility)
 *
 * WHAT HAPPENS AUTOMATICALLY (no code needed):
 *  - Network requests are tracked (count, failures, response times)
 *  - Console errors and page errors are captured
 *  - Accessibility scan runs after each test
 *  - Screenshots, videos, and traces are recorded
 *  - All of this flows into the observability reports
 *
 * HOW THE FIXTURE CHAIN WORKS FOR THESE TESTS:
 *
 *   import { test } from '../fixtures/test.fixture'
 *     └── test.fixture.ts provides `docsPage` (Page Object)
 *           └── observability.fixture.ts auto-captures metrics (invisible)
 *                 └── @playwright/test provides `page`, `browser`, etc.
 *
 * @see {@link ../pages/GettingStartedVscodePage.ts} — Page Object with locators & assertions
 * @see {@link ../fixtures/test.fixture.ts} — fixture that injects `docsPage`
 * @see {@link ../fixtures/observability.fixture.ts} — auto-fixture for metrics
 * @see {@link ../PROJECT-ARCHITECTURE.md} — Full architecture documentation
 */

/**
 * CRITICAL: Import `test` from our custom test fixture, NOT from '@playwright/test'.
 *
 * This gives us:
 *   - `docsPage` — the Page Object for the docs page
 *   - Auto network/error/a11y observability (from observability fixture)
 *   - All standard Playwright features (page, browser, context, etc.)
 *
 * If you import from '@playwright/test' directly, you lose:
 *   ❌ Page Object injection (no `docsPage` parameter)
 *   ❌ Network metrics tracking
 *   ❌ Accessibility scanning
 *   ❌ Observability data in reports
 */
import { test } from '../fixtures/test.fixture';

/**
 * `test.describe()` — Groups related tests into a suite.
 * All 5 tests in this suite test the same page ("Getting Started — VS Code").
 */
test.describe('Playwright docs - getting started with VS Code', () => {

  /**
   * `test.beforeEach()` — Runs before EACH test in this describe block.
   *
   * Opens the docs page so every test starts from the same state.
   * The `{ docsPage }` parameter is provided by our test fixture via
   * Playwright's dependency injection — we destructure it from the fixtures object.
   */
  test.beforeEach(async ({ docsPage }) => {
    await docsPage.open();
  });

  /**
   * TEST 1: Page title and heading
   *
   * Verifies that the page loaded correctly by checking:
   *  - Browser tab title contains "Getting started - VS Code"
   *  - Main H1 heading is visible with the correct text
   *
   * WHY THIS TEST? Basic smoke test — if the title/heading are wrong,
   * the page might have changed URL or the site might be down.
   */
  test('loads the page with expected title and heading', async ({ docsPage }) => {
    await docsPage.assertTitleAndMainHeading();
  });

  /**
   * TEST 2: Top-level documentation sections
   *
   * Verifies that all 6 H2 sections are visible on the page:
   * Introduction, Prerequisites, Getting Started, Core Features,
   * Advanced Features, Quick Reference.
   *
   * WHY THIS TEST? Content completeness — ensures no major section was
   * accidentally removed or renamed during a docs update.
   */
  test('shows the top-level documentation sections', async ({ docsPage }) => {
    await docsPage.assertTopSections();
  });

  /**
   * TEST 3: Sub-sections under Core Features
   *
   * Verifies that the 5 H3 sub-sections under "Core Features" are present:
   * Installation & Setup, Opening the Testing Sidebar, Running Your Tests,
   * Debugging Your Tests, Generating Tests with CodeGen.
   *
   * WHY THIS TEST? Deeper content verification — checks the second level
   * of the content hierarchy.
   */
  test('contains setup and execution subsections', async ({ docsPage }) => {
    await docsPage.assertCoreSubSections();
  });

  /**
   * TEST 4: Sidebar navigation
   *
   * Verifies the left sidebar contains:
   *  - The "Getting Started" category
   *  - The current page link ("Getting started - VS Code")
   *  - A related page link ("Running and debugging tests")
   *
   * WHY THIS TEST? Navigation integrity — ensures users can navigate
   * between related documentation pages.
   */
  test('left sidebar includes active docs entry and key navigation links', async ({ docsPage }) => {
    await docsPage.assertSidebarLinks();
  });

  /**
   * TEST 5: Table of contents anchor links
   *
   * Verifies that TOC links in the right sidebar point to real sections
   * in the page DOM (not broken anchors).
   *
   * WHY THIS TEST? Link integrity — catches broken anchor links that
   * would leave users clicking links that don't scroll to anything.
   */
  test('table of contents links point to existing sections', async ({ docsPage }) => {
    await docsPage.assertTocAnchorsResolve();
  });
});
