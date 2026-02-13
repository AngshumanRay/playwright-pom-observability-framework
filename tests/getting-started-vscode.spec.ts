/**
 * @file getting-started-vscode.spec.ts
 * @description End-to-end tests for the Playwright "Getting Started — VS Code" docs page.
 *
 * These tests follow the Page Object Model pattern:
 *  - All selectors and assertions are in `pages/GettingStartedVscodePage.ts`
 *  - This file only orchestrates test scenarios using the POM methods
 *
 * Observability (network metrics, console errors, accessibility scans) is
 * captured automatically by the fixture — no extra code needed here.
 *
 * @see {@link ../pages/GettingStartedVscodePage.ts} — Page Object with locators & assertions
 * @see {@link ../fixtures/test.fixture.ts} — fixture that injects `docsPage`
 */

import { test } from '../fixtures/test.fixture';

test.describe('Playwright docs - getting started with VS Code', () => {
  /** Navigate to the docs page before each test. */
  test.beforeEach(async ({ docsPage }) => {
    await docsPage.open();
  });

  /** Verify page title and main H1 heading render correctly. */
  test('loads the page with expected title and heading', async ({ docsPage }) => {
    await docsPage.assertTitleAndMainHeading();
  });

  /** Verify all top-level H2 documentation sections are visible. */
  test('shows the top-level documentation sections', async ({ docsPage }) => {
    await docsPage.assertTopSections();
  });

  /** Verify H3 sub-sections under Core Features are present. */
  test('contains setup and execution subsections', async ({ docsPage }) => {
    await docsPage.assertCoreSubSections();
  });

  /** Verify the left sidebar has the current page entry and key nav links. */
  test('left sidebar includes active docs entry and key navigation links', async ({ docsPage }) => {
    await docsPage.assertSidebarLinks();
  });

  /** Verify that TOC anchor links point to real sections in the page DOM. */
  test('table of contents links point to existing sections', async ({ docsPage }) => {
    await docsPage.assertTocAnchorsResolve();
  });
});
