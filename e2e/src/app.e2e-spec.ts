import { AppPage } from './app.po';
import { browser, logging } from 'protractor';

describe('workspace-project App', () => {
    let page: AppPage;

    beforeEach(() => {
        page = new AppPage();
    });

    it('should have a navbar', () => {
        page.navigateTo();
        expect(page.getNavbar()).toBe('nav');
    });

    afterEach(async () => {
        // Assert that there are no errors emitted from the browser
        const logs: Array<logging.Entry> = await browser.manage().logs().get(logging.Type.BROWSER);
        expect(logs).not.toContain(jasmine.objectContaining({
            level: logging.Level.SEVERE,
        } as logging.Entry));
    });
});
