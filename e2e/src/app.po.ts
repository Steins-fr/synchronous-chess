import { browser, by, element } from 'protractor';

export class AppPage {
    public navigateTo(): Promise<any> {
        return browser.get(browser.baseUrl) as Promise<any>;
    }

    public getNavbar(): Promise<string> {
        return element(by.css('app-root nav')).getTagName() as Promise<string>;
    }
}
