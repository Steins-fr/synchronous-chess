import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { storageChanges, storedValue, storeValue } from '@app/helpers/stored-preference.helper';
import { fromEvent } from 'rxjs';
import { ThemeModeEnum } from './enums/theme-mode.enum';

// A theme shown: the system mode resolves to one of them
export type ShownTheme = ThemeModeEnum.LIGHT | ThemeModeEnum.DARK;

/**
 * The theme of the app: the one of the system by default, or the one the user picked, kept in the local storage.
 * The data-theme attribute of the html element always holds the theme shown, light or dark (styles.scss).
 */
@Injectable({
    providedIn: 'root',
})
export class ThemeService {
    // Also read by the script of index.html, which applies the theme before the app starts (theme-preload.spec.ts)
    public static readonly storageKey: string = 'theme';
    public static readonly darkSchemeQuery: string = '(prefers-color-scheme: dark)';

    private readonly document = inject(DOCUMENT);
    // The window of the document, a browser one: its color scheme, its storage and the events of its storage
    private readonly window: Window = this.document.defaultView as Window;
    private readonly systemDarkScheme: MediaQueryList = this.window.matchMedia(ThemeService.darkSchemeQuery);
    private readonly systemTheme = signal<ShownTheme>(this.schemeTheme());
    private readonly mode = signal<ThemeModeEnum>(this.storedMode());
    public readonly theme = computed<ShownTheme>(() => {
        const mode: ThemeModeEnum = this.mode();
        return mode === ThemeModeEnum.SYSTEM ? this.systemTheme() : mode;
    });

    public constructor() {
        const destroyRef = inject(DestroyRef);
        this.apply();

        // The theme of the system changed: shown when the user picked none
        fromEvent(this.systemDarkScheme, 'change').pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
            this.systemTheme.set(this.schemeTheme());
            this.apply();
        });

        // Another tab of the app picked a theme, or cleared the storage (an event without key)
        storageChanges(this.window, ThemeService.storageKey).pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
            this.mode.set(this.storedMode());
            this.apply();
        });
    }

    // Shows the other theme. Picking the theme of the system follows the system again
    public toggle(): void {
        const other: ShownTheme = this.theme() === ThemeModeEnum.DARK ? ThemeModeEnum.LIGHT : ThemeModeEnum.DARK;
        const mode: ThemeModeEnum = other === this.systemTheme() ? ThemeModeEnum.SYSTEM : other;
        this.mode.set(mode);
        this.apply();
        storeValue(this.window, ThemeService.storageKey, mode);
    }

    private apply(): void {
        this.document.documentElement.dataset['theme'] = this.theme();
    }

    private schemeTheme(): ShownTheme {
        return this.systemDarkScheme.matches ? ThemeModeEnum.DARK : ThemeModeEnum.LIGHT;
    }

    // Nothing stored, or the storage unavailable: the theme follows the system
    private storedMode(): ThemeModeEnum {
        return storedValue(this.window, ThemeService.storageKey, ThemeModeEnum) ?? ThemeModeEnum.SYSTEM;
    }
}
