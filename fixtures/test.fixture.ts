import { test as base, expect } from './observability.fixture';
import { GettingStartedVscodePage } from '../pages/GettingStartedVscodePage';

type AppFixtures = {
  docsPage: GettingStartedVscodePage;
};

export const test = base.extend<AppFixtures>({
  docsPage: async ({ page }, use) => {
    await use(new GettingStartedVscodePage(page));
  }
});

export { expect };
