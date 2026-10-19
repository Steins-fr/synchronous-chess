import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

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
});
