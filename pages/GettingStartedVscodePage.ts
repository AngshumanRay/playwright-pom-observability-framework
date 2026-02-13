import { expect, Locator, Page } from '@playwright/test';

export class GettingStartedVscodePage {
  private readonly page: Page;
  readonly sidebarMenu: Locator;
  readonly tocLinks: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebarMenu = page.locator('.theme-doc-sidebar-menu');
    this.tocLinks = page.locator('.theme-doc-toc-desktop a.table-of-contents__link[href^="#"]');
  }

  async open(): Promise<void> {
    await this.page.goto('/docs/getting-started-vscode', { waitUntil: 'domcontentloaded' });
  }

  async assertTitleAndMainHeading(): Promise<void> {
    await expect(this.page).toHaveTitle(/Getting started - VS Code/i);
    await expect(this.page.getByRole('heading', { level: 1, name: /Getting started - VS Code/i })).toBeVisible();
  }

  async assertTopSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 2, name: /Introduction/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Prerequisites/i })).toBeVisible();
    await expect(this.page.getByRole('heading', {       level: 2, name: /Getting Started/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Core Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Advanced Features/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 2, name: /Quick Reference/i })).toBeVisible();
  }

  async assertCoreSubSections(): Promise<void> {
    await expect(this.page.getByRole('heading', { level: 3, name: /Installation & Setup/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Opening the Testing Sidebar/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Running Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Debugging Your Tests/i })).toBeVisible();
    await expect(this.page.getByRole('heading', { level: 3, name: /Generating Tests with CodeGen/i })).toBeVisible();
  }

  async assertSidebarLinks(): Promise<void> {
    await expect(this.sidebarMenu).toBeVisible();
    await expect(this.sidebarMenu.getByText(/^Getting Started$/i)).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Getting started - VS Code$/i })).toBeVisible();
    await expect(this.sidebarMenu.getByRole('link', { name: /^Running and debugging tests$/i })).toBeVisible();
  }

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
