import { TestBed } from '@angular/core/testing';
import { ThemeModeEnum } from './enums/theme-mode.enum';
import { ThemeService } from './theme.service';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type FakeMediaQueryList = EventTarget & { matches: boolean };

describe('ThemeService', () => {
    let systemDarkScheme: FakeMediaQueryList;

    function createService(): ThemeService {
        return TestBed.inject(ThemeService);
    }

    function htmlTheme(): string | undefined {
        return document.documentElement.dataset['theme'];
    }

    function storedTheme(): string | null {
        return localStorage.getItem(ThemeService.storageKey);
    }

    function changeSystemScheme(dark: boolean): void {
        systemDarkScheme.matches = dark;
        systemDarkScheme.dispatchEvent(new Event('change'));
    }

    beforeEach(() => {
        localStorage.clear();
        systemDarkScheme = Object.assign(new EventTarget(), { matches: false });
        vi.spyOn(globalThis, 'matchMedia').mockReturnValue(systemDarkScheme as unknown as MediaQueryList);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        delete document.documentElement.dataset['theme'];
    });

    test('should show the theme of the system when no theme was picked, and follow its changes', () => {
        // When
        const service: ThemeService = createService();

        // Then
        expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
        expect(service.theme()).toBe(ThemeModeEnum.LIGHT);
        expect(htmlTheme()).toBe(ThemeModeEnum.LIGHT);

        // When
        changeSystemScheme(true);

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.DARK);
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);
    });

    test('should show the theme picked before, whatever the theme of the system', () => {
        // Given
        localStorage.setItem(ThemeService.storageKey, ThemeModeEnum.DARK);

        // When
        const service: ThemeService = createService();
        changeSystemScheme(false);

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.DARK);
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);
    });

    test('should follow the system when the stored theme is unknown', () => {
        // Given
        localStorage.setItem(ThemeService.storageKey, 'sepia');
        systemDarkScheme.matches = true;

        // When
        const service: ThemeService = createService();

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.DARK);
    });

    test('toggle should show the other theme, and follow the system again once back to its theme', () => {
        // Given
        const service: ThemeService = createService();

        // When
        service.toggle();

        // Then
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);
        expect(storedTheme()).toBe(ThemeModeEnum.DARK);

        // When
        service.toggle();

        // Then
        expect(htmlTheme()).toBe(ThemeModeEnum.LIGHT);
        expect(storedTheme()).toBe(ThemeModeEnum.SYSTEM);

        // When
        changeSystemScheme(true);

        // Then
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);
    });

    test('toggle should pick the light theme against a dark system', () => {
        // Given
        systemDarkScheme.matches = true;
        const service: ThemeService = createService();

        // When
        service.toggle();
        changeSystemScheme(false);
        changeSystemScheme(true);

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.LIGHT);
        expect(storedTheme()).toBe(ThemeModeEnum.LIGHT);
    });

    test('should show the theme another tab of the app picked, or the one of the system once the storage cleared', () => {
        // Given
        const service: ThemeService = createService();
        localStorage.setItem(ThemeService.storageKey, ThemeModeEnum.DARK);

        // When
        globalThis.dispatchEvent(new StorageEvent('storage', { key: 'another-key' }));

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.LIGHT);

        // When
        globalThis.dispatchEvent(new StorageEvent('storage', { key: ThemeService.storageKey }));

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.DARK);
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);

        // When
        localStorage.clear();
        globalThis.dispatchEvent(new StorageEvent('storage', { key: null }));

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.LIGHT);
        expect(htmlTheme()).toBe(ThemeModeEnum.LIGHT);
    });

    test('should follow the system, and still switch the theme, when the local storage is blocked', () => {
        // Given
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        const service: ThemeService = createService();

        // When
        service.toggle();

        // Then
        expect(service.theme()).toBe(ThemeModeEnum.DARK);
        expect(htmlTheme()).toBe(ThemeModeEnum.DARK);
    });
});
