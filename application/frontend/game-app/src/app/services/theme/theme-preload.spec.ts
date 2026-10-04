/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { ThemeModeEnum } from './enums/theme-mode.enum';
import { ThemeService } from './theme.service';
import { afterEach, describe, expect, test, vi } from 'vitest';

// The script of index.html applies the theme before the app starts: it must show the theme ThemeService shows once
// the app runs, from the same key and values of the local storage
describe('theme-preload script of index.html', () => {
    const script: string = /<script id="theme-preload">([\s\S]*?)<\/script>/.exec(readFileSync('src/index.html', 'utf8'))?.[1] ?? '';

    function shownThemes(): { preload: string | undefined; service: string | undefined } {
        new Function(script)();
        const preload: string | undefined = document.documentElement.dataset['theme'];
        delete document.documentElement.dataset['theme'];
        TestBed.inject(ThemeService);
        return { preload, service: document.documentElement.dataset['theme'] };
    }

    function systemScheme(dark: boolean): void {
        vi.spyOn(globalThis, 'matchMedia').mockReturnValue(Object.assign(new EventTarget(), { matches: dark }) as unknown as MediaQueryList);
    }

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        delete document.documentElement.dataset['theme'];
    });

    test('should be found in index.html', () => {
        expect(script).toContain('localStorage');
    });

    test.each<[string, ThemeModeEnum | null, boolean, ThemeModeEnum]>([
        ['no theme picked, a light system', null, false, ThemeModeEnum.LIGHT],
        ['no theme picked, a dark system', null, true, ThemeModeEnum.DARK],
        ['the system theme picked', ThemeModeEnum.SYSTEM, true, ThemeModeEnum.DARK],
        ['the light theme picked', ThemeModeEnum.LIGHT, true, ThemeModeEnum.LIGHT],
        ['the dark theme picked', ThemeModeEnum.DARK, false, ThemeModeEnum.DARK],
    ])('should show the theme of ThemeService with %s', (_case: string, picked: ThemeModeEnum | null, systemDark: boolean, shown: ThemeModeEnum) => {
        // Given
        if (picked) {
            localStorage.setItem(ThemeService.storageKey, picked);
        }
        systemScheme(systemDark);

        // When / Then
        expect(shownThemes()).toEqual({ preload: shown, service: shown });
    });

    test('should show the theme of the system when the local storage is blocked', () => {
        // Given
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        systemScheme(true);

        // When / Then
        expect(shownThemes()).toEqual({ preload: ThemeModeEnum.DARK, service: ThemeModeEnum.DARK });
    });
});
