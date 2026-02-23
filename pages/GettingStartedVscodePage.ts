/**
 * @file GettingStartedVscodePage.ts
 * @description Page Object Model (POM) class for the Playwright "Getting Started — VS Code" docs page.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PAGE OBJECT MODEL (POM) — KEY DESIGN PATTERN                         ║
 * ║                                                                        ║
 * ║  The POM pattern separates WHAT to test from HOW to interact with     ║
 * ║  the page. This class contains:                                        ║
 * ║    • Locators (CSS selectors, roles) — HOW to find elements           ║
 * ║    • Actions (navigation) — HOW to interact with the page             ║
 * ║    • Assertions — WHAT to verify about the page                       ║
 * ║                                                                        ║
 * ║  Test files NEVER use raw selectors. They call methods on this class.  ║
 * ║  If the website changes its HTML, you fix it HERE, not in tests.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * HOW THIS FILE IS USED:
 *
 *   1. fixtures/test.fixture.ts creates an instance: `new GettingStartedVscodePage(page)`
 *   2. The instance is injected into tests as the `docsPage` fixture parameter
 *   3. Tests call methods like: `await docsPage.open()`, `await docsPage.assertTopSections()`
 *
 * THE PAGE BEING TESTED:
 *   https://playwright.dev/docs/getting-started-vscode
 *   This is Playwright's official documentation page for VS Code integration.
 *   It has a sidebar navigation, table of contents, and multiple content sections.
 *
 * HOW TO ADD A NEW PAGE OBJECT (for a different page):
 *   1. Create a new file in `pages/` (e.g., `pages/LoginPage.ts`)
 *   2. Export a class with locators in constructor, methods for actions/assertions
 *   3. Register it in `fixtures/test.fixture.ts` as a new fixture
 *   4. Use it in tests: `async ({ loginPage }) => { ... }`
 *
 * @see {@link https://playwright.dev/docs/getting-started-vscode} — the page being tested
 * @see {@link ../tests/getting-started-vscode.spec.ts} — test file that uses this POM
 * @see {@link ../fixtures/test.fixture.ts} — fixture that injects this as `docsPage`
 * @see {@link ../PROJECT-ARCHITECTURE.md} — Full architecture documentation
 */

import { expect, Locator, Page } from '@playwright/test';

/**
 * Page Object for the "Getting Started — VS Code" documentation page.
 *
 * This class encapsulates ALL interaction with the page:
 *  - **Constructor** — Sets up locators (finds elements on the page)
 *  - **`open()`** — Navigates to the page
 *  - **`assert*()` methods** — Verify specific aspects of the page
 *
 * LOCATOR STRATEGY:
 *  We use Playwright's recommended locator strategies in this order:
 *  1. `getByRole()` — Accessible role + name (most resilient to HTML changes)
 *  2. `getByText()` — Visible text content
 *  3. CSS selectors — Only for structural elements (sidebar menu, TOC links)
 */
export class GettingStartedVscodePage {
  /**
   * Playwright Page instance — the browser tab this page object controls.
   * Injected by the test fixture when creating this instance.
   */
  private readonly page: Page;

  /**
   * Left sidebar navigation menu locator.
   * This is the main navigation on the left side of Playwright docs.
   * Uses CSS class selector because the sidebar doesn't have a distinct ARIA role.
   */
  readonly sidebarMenu: Locator;

  /**
   * Table-of-contents links in the right-hand sidebar.
   * These are anchor links (href starts with "#") that jump to sections on the page.
   * We use a compound CSS selector to match only TOC links, not other page links.
   */
  readonly tocLinks: Locator;

  /**
   * Constructor — called once per test by the fixture.
   *
   * @param page - The Playwright Page instance (fresh browser tab)
   *
   * IMPORTANT: Locators are set up here but NOT evaluated yet.
   * Playwright locators are "lazy" — they only query the DOM when you
   * call methods like `.click()`, `.isVisible()`, or use them in `expect()`.
   * This means the page doesn't need to be loaded when the constructor runs.
   */
  constructor(page: Page) {
    this.page = page;

    // Sidebar: main navigation menu on the left side of the docs page.
    // The `.theme-doc-sidebar-menu` class is part of Docusaurus (the framework
    // that Playwright's docs site is built with).
    this.sidebarMenu = page.locator('.theme-doc-sidebar-menu');

    // TOC: anchor links in the right-hand table of contents.
    // Selector breakdown:
    //   .theme-doc-toc-desktop  → the right-side TOC container
    //   a.table-of-contents__link → links with the TOC class
    //   [href^="#"]              → only links starting with "#" (anchor links)
    this.tocLinks = page.locator('.theme-doc-toc-desktop a.table-of-contents__link[href^="#"]');
  }

  // -------------------------------------------------------------------------
  //  Navigation
  //  Methods that navigate to or interact with the page
  // -------------------------------------------------------------------------

  /**
   * Navigate to the "Getting Started — VS Code" docs page.
   *
   * Uses `page.goto()` with a relative URL. The base URL comes from
   * `playwright.config.ts` (`baseURL: 'https://playwright.dev'`), so
   * the full URL becomes: `https://playwright.dev/docs/getting-started-vscode`
   *
   * `waitUntil: 'domcontentloaded'` — Wait for the HTML to be fully parsed
   * (but don't wait for images, stylesheets, etc. to finish loading).
   * This is faster than 'load' and good enough for our assertions.
   */
  async open(): Promise<void> {
    await this.page.goto('/docs/getting-started-vscode', { waitUntil: 'domcontentloaded' });
  }

  // -------------------------------------------------------------------------
  //  Assertions
  //  Each method checks ONE specific aspect of the page.
  //  They use Playwright's `expect()` which auto-retries until the assertion
  //  passes or the timeout (10 seconds, from config) expires.
  //
  //  WHY SEPARATE METHODS?
  //  Each test should verify one behavior. Having small, focused assertion
  //  methods lets tests compose exactly what they need to check.
  // -------------------------------------------------------------------------

  /**
   * Verify that the page title and the main H1 heading are correct.
   *
   * Checks:
   *  1. The browser tab title contains "Getting started - VS Code"
   *  2. A visible H1 heading with that text exists on the page
   *
   * Uses regex (`/Getting started - VS Code/i`) for case-insensitive matching
   * to be resilient to minor text changes on the website.
   */
  async assertTitleAndMainHeading(): Promise<void> {
    await expect(this.page).toHaveTitle(/Getting started - VS Code/i);
    await expect(this.page.getByRole('heading', { level: 1, name: /Getting started - VS Code/i })).toBeVisible();
  }

  /**
   * Verify that all top-level H2 documentation sections are visible.
   *
   * The Getting Started page has 6 major sections marked with H2 headings:
   * Introduction, Prerequisites, Getting Started, Core Features, Advanced Features, Quick Reference.
   *
   * Uses `getByRole('heading', { level: 2, name: /.../ })` — this is Playwright's
   * recommended locator strategy because it's based on accessibility roles,
   * not CSS classes that might change.
   */
  async assertTopSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 2, name: /Introduction/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Prerequisites/i })).toBeVisible();
    await expect(this.page.getByRole('heading', {       level: 2, name: /Getting Started/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Core Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Advanced Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Quick Reference/i })).toBeVisible();
  }

  /**
   * Verify that the Core Features H3 sub-sections are visible.
   *
   * Under the "Core Features" H2 section, there are 5 H3 sub-sections:
   * Installation & Setup, Opening the Testing Sidebar, Running Your Tests,
   * Debugging Your Tests, Generating Tests with CodeGen.
   *
   * This verifies the page content structure is complete and properly rendered.
   */
  async assertCoreSubSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 3, name: /Installation & Setup/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Opening the Testing Sidebar/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Running Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Debugging Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Generating Tests with CodeGen/i })).toBeVisible();
  }

  /**
   * Verify the left sidebar contains expected navigation links.
   *
   * The sidebar is the main navigation panel on the left side of every
   * Playwright docs page. We check:
   *  1. The sidebar itself is visible
   *  2. "Getting Started" category text exists
   *  3. The current page link ("Getting started - VS Code") exists
   *  4. Related page link ("Running and debugging tests") exists
   */
  async assertSidebarLinks(): Promise<void> {
    await expect(this.sidebarMenu).toBeVisible();
    await expect(this.sidebarMenu.getByText(/^Getting Started$/i)).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Getting started - VS Code$/i })).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Running and debugging tests$/i })).toBeVisible();
  }

  /**
   * Verify that table-of-contents (TOC) anchor links resolve to real DOM sections.
   *
   * The right-hand sidebar has a TOC with links like `#introduction`, `#prerequisites`, etc.
   * This method verifies that:
   *  1. There are at least 7 TOC links (the page should have many sections)
   *  2. There are at least 5 unique anchor hrefs
   *  3. Each anchor href points to an actual element in the page DOM
   *
   * This catches broken anchor links — a common issue when content is reorganized.
   *
   * @param maxAnchors - Maximum number of anchors to validate (default: 8).
   *   We limit this to avoid excessive checks on pages with many TOC entries.
   */
  async assertTocAnchorsResolve(maxAnchors = 8): Promise<void> {
    const count = await this.tocLinks.count();
    expect(count).toBeGreaterThan(6);

    const hrefs = await this.tocLinks.evaluateAll((links) => {
      const values = links
        .map((link) => link.getAttribute('href') || '')
        .filter((href) => href.startsWith('#'));
      return Array.from(new Set(values));
    });

    expect(hrefs.length).toBeGreaterThan(4);

    for (const href of hrefs.slice(0, maxAnchors)) {
      await expect(this.page.locator(href).first(), `Expected section for ${href}`).toBeAttached();
    }
  }
}
