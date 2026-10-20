import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Translation, TranslocoService } from '@jsverse/transloco';
import { LOADER_DELAY } from '@app/helpers/signal.helper';
import { Language } from '@app/services/language/enums/language.enum';
import { LanguageService } from '@app/services/language/language.service';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
        document.documentElement.removeAttribute('lang');
    });

    test('should name each language in itself, and check the language shown', async () => {
        // When
        const items: HTMLButtonElement[] = await openMenu();

        // Then
        expect(menuButton().getAttribute('aria-label')).toBe('Choose the language');
        expect(items.map((item: HTMLButtonElement) => item.textContent.replace('check', '').trim())).toEqual([
            'English', 'Français', 'Español', 'Português (Brasil)', 'Português (Portugal)', 'Deutsch', 'Русский', 'Türkçe',
            'Bahasa Indonesia', 'Polski', 'Italiano',
        ]);
        expect(items.map((item: HTMLButtonElement) => item.lang)).toEqual([
            Language.EN, Language.FR, Language.ES, Language.PT_BR, Language.PT_PT, Language.DE, Language.RU, Language.TR,
            Language.ID, Language.PL, Language.IT,
        ]);
        expect(items.map((item: HTMLButtonElement) => item.getAttribute('aria-checked'))).toEqual(['true', ...Array(10).fill('false')]);
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

    test('should turn a ring around its icon while the language picked loads long', async () => {
        // Given
        const loaded = new Subject<Translation>();
        vi.spyOn(TestBed.inject(TranslocoService), 'load').mockReturnValue(loaded);
        const items: HTMLButtonElement[] = await openMenu();
        vi.useFakeTimers();

        // When
        items[1].click();
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(LOADER_DELAY);
        fixture.detectChanges();

        // Then
        expect(menuButton().querySelector('mat-spinner')).not.toBeNull();
        expect(menuButton().getAttribute('aria-busy')).toBe('true');

        // When
        loaded.next({});
        loaded.complete();
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();

        // Then
        expect(menuButton().querySelector('mat-spinner')).toBeNull();
        expect(menuButton().getAttribute('aria-busy')).toBe('false');
        expect(TestBed.inject(LanguageService).language()).toBe(Language.FR);
    });
});
