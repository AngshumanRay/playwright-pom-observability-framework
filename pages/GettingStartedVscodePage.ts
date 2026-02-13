/**
 * @file GettingStartedVscodePage.ts
 * @description Page Object Model (POM) for the Playwright "Getting Started — VS Code" docs page.
 *
 * All selectors and assertions live here. Test files should never use raw
 * locators — they call the methods on this class instead.
 *
 * @see {@link https://playwright.dev/docs/getting-started-vscode} — target page
 * @see {@link ../tests/getting-started-vscode.spec.ts} — test file that uses this POM
 */

import { expect, Locator, Page } from '@playwright/test';

/**
 * Page Object for the "Getting Started — VS Code" documentation page.
 *
 * Encapsulates:
 *  - Page navigation (`open`)
 *  - Locators for sidebar, table-of-contents, headings
 *  - Assertion methods for title, sections, sidebar and TOC anchors
 */
export class GettingStartedVscodePage {
  /** Playwright page instance injected via the test fixture. */
  private readonly page: Page;

  /** Left sidebar navigation menu. */
  readonly sidebarMenu: Locator;

  /** Table-of-contents links in the right-hand sidebar. */
  readonly tocLinks: Locator;

  constructor(page: Page) {
    this.page = page;

    // Sidebar: main navigation menu on the left
    this.sidebarMenu = page.locator('.theme-doc-sidebar-menu');

    // TOC: anchor links in the right-hand table of contents
    this.tocLinks = page.locator('.theme-doc-toc-desktop a.table-of-contents__link[href^="#"]');
  }

  // -------------------------------------------------------------------------
  //  Navigation
  // -------------------------------------------------------------------------

  /** Navigate to the "Getting Started — VS Code" docs page. */
  async open(): Promise<void> {
    await this.page.goto('/docs/getting-started-vscode', { waitUntil: 'domcontentloaded' });
  }

  // -------------------------------------------------------------------------
  //  Assertions
  // -------------------------------------------------------------------------

  /** Verify that the page title and the main H1 heading are correct. */
  async assertTitleAndMainHeading(): Promise<void> {
    await expect(this.page).toHaveTitle(/Getting started - VS Code/i);
    await expect(this.page.getByRole('heading', { level: 1, name: /Getting started - VS Code/i })).toBeVisible();
  }

  /** Verify that all top-level H2 documentation sections are visible. */
  async assertTopSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 2, name: /Introduction/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Prerequisites/i })).toBeVisible();
    await expect(this.page.getByRole('heading', {       level: 2, name: /Getting Started/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Core Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Advanced Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Quick Reference/i })).toBeVisible();
  }

  /** Verify that the Core Features H3 sub-sections are visible. */
  async assertCoreSubSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 3, name: /Installation & Setup/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Opening the Testing Sidebar/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Running Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Debugging Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Generating Tests with CodeGen/i })).toBeVisible();
  }

  /** Verify the left sidebar contains expected navigation links. */
  async assertSidebarLinks(): Promise<void> {
    await expect(this.sidebarMenu).toBeVisible();
    await expect(this.sidebarMenu.getByText(/^Getting Started$/i)).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Getting started - VS Code$/i })).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Running and debugging tests$/i })).toBeVisible();
  }

  /**
   * Verify that table-of-contents anchor links resolve to real DOM sections.
   * @param maxAnchors - Maximum number of anchors to validate (default: 8)
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
