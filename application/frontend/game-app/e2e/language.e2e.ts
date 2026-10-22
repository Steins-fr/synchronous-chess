import { expect, Locator, Page, Route } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

declare global {
    interface Window {
        /** The texts of the navigation and of the presentation of the chess, one entry each time they change */
        textFrames: string[];
    }
}

/** The language of the app: the one of the browser, switched from the menu without a reload */
test.describe('Language', () => {
    test('shows the page in the language of the browser, and switches it from the menu', async ({ room }) => {
        // When
        const pierre: RoomParticipant = await room.visit('pierre', 'fr-FR');

        // Then
        await expect(pierre.page.getByRole('heading', { name: 'Salles ouvertes' })).toBeVisible();
        await expect(pierre.page.getByRole('button', { name: 'Créer une salle', exact: true })).toBeVisible();
        await expect(pierre.page.locator('html')).toHaveAttribute('lang', 'fr');
        await expect(pierre.page).toHaveTitle('Échecs synchrones');

        // When: a mark on the page, gone if it reloads
        await pierre.page.evaluate(() => {
            document.body.dataset['notReloaded'] = 'true';
        });
        await pierre.page.getByRole('button', { name: 'Choisir la langue' }).click();
        await pierre.page.getByRole('menuitemradio', { name: 'English' }).click();

        // Then
        await expect(pierre.page.getByRole('heading', { name: 'Open rooms' })).toBeVisible();
        await expect(pierre.page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(pierre.page).toHaveTitle('Synchronous Chess');
        await expect(pierre.page.locator('body')).toHaveAttribute('data-not-reloaded');
    });

    test('switches every text at once, those of a page opened while the language loads included', async ({ room }) => {
        // Given: the chat page, its menu loaded, then the files of the chunks held while the language picked loads
        const pierre: RoomParticipant = await room.visit('pierre');
        const page: Page = pierre.page;
        const errors: Error[] = [];
        page.on('pageerror', (error: Error) => errors.push(error));
        const languageButton: Locator = page.locator('#language-button');
        await expect(languageButton).toBeVisible();
        const held: Route[] = [];
        let holding: boolean = false;
        await page.route('**/chunk-*.js', async (route: Route) => {
            if (holding) {
                held.push(route);
                return;
            }
            // Not held: slow enough for a text shown late to be seen
            await new Promise((resolve) => setTimeout(resolve, 300));
            await route.continue();
        });

        // When: French picked, its translations held
        await languageButton.click();
        holding = true;
        await page.getByRole('menuitemradio', { name: 'Français' }).click();

        // Then: a ring turns around the menu while it loads
        await expect(languageButton).toHaveAttribute('aria-busy', 'true');

        // When: the chess page, never shown before, opens meanwhile
        holding = false;
        await page.locator('app-root > nav').getByRole('link', { name: 'Chess', exact: true }).click();

        // Then
        const presentationTitle: Locator = page.locator('app-chess-presentation h1');
        await expect(presentationTitle).toHaveText('Synchronous chess');

        // When: the translations of French load
        await page.evaluate(() => {
            window.textFrames = [];
            const sample = (): void => {
                const frame: string = `${ document.querySelector('app-root > nav a')?.textContent?.trim() } | ${ document.querySelector('app-chess-presentation h1')?.textContent?.trim() }`;
                if (window.textFrames.at(-1) !== frame) {
                    window.textFrames.push(frame);
                }
                requestAnimationFrame(sample);
            };
            sample();
        });
        await Promise.all(held.map((route: Route) => route.continue()));

        // Then: the texts of the page switch with the others, none in English among French ones
        await expect(presentationTitle).toHaveText('Échecs synchrones');
        await expect(languageButton).toHaveAttribute('aria-busy', 'false');
        expect(await page.evaluate(() => window.textFrames)).toEqual(['Home | Synchronous chess', 'Accueil | Échecs synchrones']);
        expect(errors).toEqual([]);
    });
});
