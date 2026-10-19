import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Language } from '@app/services/language/enums/language.enum';
import { LanguageService } from '@app/services/language/language.service';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { LanguageMenuComponent } from './language-menu.component';

describe('LanguageMenuComponent', () => {
    let fixture: ComponentFixture<LanguageMenuComponent>;

    function menuButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#language-button');
    }

    // The items of the menu, open in the overlay of the page
    async function openMenu(): Promise<HTMLButtonElement[]> {
        menuButton().click();
        await fixture.whenStable();
        return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    }

    beforeEach(async () => {
        localStorage.clear();
        fixture = TestBed.createComponent(LanguageMenuComponent);
        await fixture.whenStable();
    });

    afterEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('lang');
    });

    test('should name each language in itself, and check the language shown', async () => {
        // When
        const items: HTMLButtonElement[] = await openMenu();

        // Then
        expect(menuButton().getAttribute('aria-label')).toBe('Choose the language');
        expect(items.map((item: HTMLButtonElement) => item.textContent.replace('check', '').trim())).toEqual(['English', 'Français', 'Español', 'Português (Brasil)', 'Português (Portugal)', 'Deutsch', 'Русский', 'Türkçe', 'Bahasa Indonesia', 'Polski']);
        expect(items.map((item: HTMLButtonElement) => item.lang)).toEqual([Language.EN, Language.FR, Language.ES, Language.PT_BR, Language.PT_PT, Language.DE, Language.RU, Language.TR, Language.ID, Language.PL]);
        expect(items.map((item: HTMLButtonElement) => item.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false']);
    });

    test('should switch to the language picked', async () => {
        // Given
        const items: HTMLButtonElement[] = await openMenu();

        // When
        items[1].click();
        await fixture.whenStable();

        // Then
        expect(TestBed.inject(LanguageService).language()).toBe(Language.FR);
        expect(menuButton().getAttribute('aria-label')).toBe('Choisir la langue');
    });
});
