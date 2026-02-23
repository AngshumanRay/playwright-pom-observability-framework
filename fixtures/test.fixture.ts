/**
 * @file test.fixture.ts
 * @description The "bridge" between Page Objects and Tests — the fixture that wires
 *              page object instances into every test via Playwright's dependency injection.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  EVERY TEST FILE IMPORTS `test` AND `expect` FROM THIS FILE.           ║
 * ║  Never import directly from '@playwright/test' in your test files.     ║
 * ║                                                                        ║
 * ║  WHY? Because this file extends the observability fixture, which       ║
 * ║  extends @playwright/test. Importing from here gives you:              ║
 * ║    1. Automatic network/error/a11y observability (from observability   ║
 * ║       fixture)                                                         ║
 * ║    2. Page objects injected as test parameters (from this file)         ║
 * ║    3. All standard Playwright features (page, browser, context)        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * FIXTURE CHAIN (why imports matter):
 *
 *   @playwright/test                     ← Base (provides page, browser, etc.)
 *         │
 *         │ extended by observability.fixture.ts
 *         │ (adds auto network/error/a11y instrumentation)
 *         │
 *         │ extended by THIS FILE (test.fixture.ts)
 *         │ (adds docsPage → GettingStartedVscodePage instance)
 *         │
 *         ▼
 *   tests/*.spec.ts imports `test` from here
 *
 * HOW TO ADD A NEW PAGE OBJECT:
 *   1. Create a new Page Object class in `pages/` (e.g., `LoginPage.ts`)
 *   2. Add it to the `AppFixtures` type below (e.g., `loginPage: LoginPage`)
 *   3. Add the fixture definition below that creates the instance
 *   4. Now every test can use `async ({ loginPage }) => { ... }`
 *
 * @example
 *   // In a test file:
 *   import { test } from '../fixtures/test.fixture';
 *
 *   test('example', async ({ docsPage }) => {
 *     await docsPage.open();
 *     await docsPage.assertTitleAndMainHeading();
 *   });
 *
 * @see {@link ../fixtures/observability.fixture.ts} — Auto-fixture that captures metrics
 * @see {@link ../pages/GettingStartedVscodePage.ts} — Page Object injected as `docsPage`
 * @see {@link ../PROJECT-ARCHITECTURE.md} — Full architecture documentation
 */

/**
 * IMPORTANT: We import `test` from observability.fixture.ts (NOT from @playwright/test).
 * This ensures that our auto-fixture for network/error/a11y monitoring is included
 * in the chain. The observability fixture itself imports from @playwright/test internally.
 */
import { test as base, expect } from './observability.fixture';
import { GettingStartedVscodePage } from '../pages/GettingStartedVscodePage';

// ---------------------------------------------------------------------------
//  Custom fixture types
//  These define what page objects are available in every test.
//  When a test writes `async ({ docsPage }) => { ... }`, TypeScript knows
//  that `docsPage` is a GettingStartedVscodePage because of this type.
// ---------------------------------------------------------------------------

/**
 * Fixtures exposed to every test via Playwright's dependency injection.
 *
 * To add a new page object:
 *   1. Add a property here: `myPage: MyPageObjectClass`
 *   2. Add the fixture definition below in `base.extend<AppFixtures>({...})`
 */
type AppFixtures = {
  /**
   * Page Object for the "Getting Started — VS Code" documentation page.
   * Provides methods like open(), assertTitleAndMainHeading(), assertTopSections(), etc.
   */
  docsPage: GettingStartedVscodePage;
};

// ---------------------------------------------------------------------------
//  Fixture definition
//  This is where we tell Playwright HOW to create each page object.
//  `base.extend<AppFixtures>({...})` takes the test object from the
//  observability fixture and adds our page object fixtures on top.
// ---------------------------------------------------------------------------

/**
 * Extended `test` object that provides:
 * - `docsPage` — a ready-to-use page object (instantiated with the current `page`)
 * - All observability instrumentation from `observability.fixture.ts` (auto-attached)
 * - All standard Playwright fixtures: `page`, `browser`, `context`, etc.
 *
 * This is what test files import:
 *   import { test } from '../fixtures/test.fixture';
 */
export const test = base.extend<AppFixtures>({
  /**
   * Create a fresh GettingStartedVscodePage instance for each test.
   *
   * How this works:
   *   1. Playwright provides `page` (a fresh browser page for this test)
   *   2. We create a new GettingStartedVscodePage(page) wrapping that page
   *   3. `await use(...)` hands it to the test as the `docsPage` parameter
   *   4. After the test finishes, Playwright automatically cleans up the page
   *
   * Each test gets a FRESH instance — no state leaks between tests.
   */
  docsPage: async ({ page }, use) => {
    await use(new GettingStartedVscodePage(page));
  }
});

/**
 * Re-export `expect` so test files can import both `test` and `expect`
 * from the same file:
 *   import { test, expect } from '../fixtures/test.fixture';
 */
export { expect };
