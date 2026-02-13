import { test } from '../fixtures/test.fixture';

test.describe('Playwright docs - getting started with VS Code', () => {
  test.beforeEach(async ({ docsPage }) => {
    await docsPage.open();
  });

  test('loads the page with expected title and heading', async ({ docsPage }) => {
    await docsPage.assertTitleAndMainHeading();
  });

  test('shows the top-level documentation sections', async ({ docsPage }) => {
    await docsPage.assertTopSections();
  });

  test('contains setup and execution subsections', async ({ docsPage }) => {
    await docsPage.assertCoreSubSections();
  });

  test('left sidebar includes active docs entry and key navigation links', async ({ docsPage }) => {
    await docsPage.assertSidebarLinks();
  });

  test('table of contents links point to existing sections', async ({ docsPage }) => {
    await docsPage.assertTocAnchorsResolve();
  });
});
