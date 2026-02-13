/**
 * @file test.fixture.ts
 * @description Main test fixture that wires page objects into every test.
 *
 * This file extends the observability fixture (which already captures network,
 * error and accessibility metrics) and adds application-specific page objects.
 * Tests should import `test` and `expect` from this file — never from
 * Playwright directly — so that all automatic instrumentation is included.
 *
 * @example
 *   import { test } from '../fixtures/test.fixture';
 *   test('example', async ({ docsPage }) => { ... });
 */

import { test as base, expect } from './observability.fixture';
import { GettingStartedVscodePage } from '../pages/GettingStartedVscodePage';

// ---------------------------------------------------------------------------
//  Custom fixture types
// ---------------------------------------------------------------------------

/** Fixtures exposed to every test via dependency injection. */
type AppFixtures = {
  /** Page Object for the "Getting Started — VS Code" documentation page. */
  docsPage: GettingStartedVscodePage;
};

// ---------------------------------------------------------------------------
//  Fixture definition
// ---------------------------------------------------------------------------

/**
 * Extended `test` object that provides:
 * - `docsPage` — a ready-to-use page object (instantiated with the current `page`)
 * - All observability instrumentation from `observability.fixture.ts` (auto-attached)
 */
export const test = base.extend<AppFixtures>({
  /** Create a fresh GettingStartedVscodePage instance for each test. */
  docsPage: async ({ page }, use) => {
    await use(new GettingStartedVscodePage(page));
  }
});

export { expect };
