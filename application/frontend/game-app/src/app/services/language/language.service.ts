import { computed, DOCUMENT, effect, inject, Injectable, Signal, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { objectHasValue } from '@app/helpers/object.helper';
import { catchError, EMPTY, firstValueFrom, forkJoin, switchMap } from 'rxjs';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';

/**
 * The language of the app: the one the user picked, kept in the local storage, else the first language of the browser the
 * app speaks, else English. Switching it translates the texts shown, without a reload: a reload would reconnect the peers
 * of a match. The lang attribute of the html element and the title of the page follow it. A language picked shows once its
 * global texts and the texts of every game are loaded: every text switches at once, those of a page opened meanwhile
 * included.
 */
@Injectable({
    providedIn: 'root',
})
export class LanguageService {
    public static readonly storageKey: string = 'language';

    private readonly document = inject(DOCUMENT);
    // The window of the document, a browser one: its languages and its storage
    private readonly window: Window = this.document.defaultView as Window;
    private readonly transloco = inject(TranslocoService);
    public readonly language: Signal<Language> = computed(() => this.transloco.activeLang() as Language);
    // The language picked while it loads: a later pick replaces it
    private readonly picked = signal<Language | null>(null);
    /** Whether a language picked loads */
    public readonly switching: Signal<boolean> = computed(() => this.picked() !== null);

    public constructor() {
        this.transloco.setActiveLang(this.storedLanguage() ?? LanguageService.browserLanguage(this.window.navigator.languages));

        const title = inject(Title);
        // The title in the language shown, once loaded. A language failing to load names nothing, the next one naming the
        // page again: translateSignal() would stop following the language at the first failure
        const appTitle: Signal<string> = toSignal(this.transloco.langChanges$.pipe(
            switchMap((language: string) => this.transloco.selectTranslate<string>('app.title', {}, language).pipe(catchError(() => EMPTY))),
        ), { initialValue: '' });
        effect(() => {
            this.document.documentElement.lang = this.language();
        });
        effect(() => title.setTitle(appTitle()));
    }

    // The first language of the browser the app speaks, matched on its full code first, then on its base language
    // (es-MX gives es)
    private static browserLanguage(tags: ReadonlyArray<string>): Language {
        for (const tag of tags) {
            const code: string = tag.toLowerCase();
            const language: Language | undefined = Object.values(Language).find((candidate: Language) => candidate.toLowerCase() === code)
                ?? LanguageService.baseLanguage(code);
            if (language) {
                return language;
            }
        }
        return Language.EN;
    }

    // Portuguese follows CLDR: Brazil is the default region of pt, every other region speaks the European norm
    private static baseLanguage(code: string): Language | undefined {
        const [base] = code.split('-');
        if (base === 'pt') {
            return code === 'pt' ? Language.PT_BR : Language.PT_PT;
        }
        return Object.values(Language).find((candidate: Language) => candidate === base);
    }

    // Loads the active language before the first render (provideTranslation). Failing, the app shows English
    public async preload(): Promise<void> {
        const loaded: boolean = await this.load([this.language()]);
        if (!loaded && this.language() !== Language.EN) {
            this.transloco.setActiveLang(Language.EN);
            await this.load([Language.EN]);
        }
    }

    // Shows the language once loaded, with the scopes of every game, so that no text shows its key meanwhile nor switches
    // after the others. Failing, the app keeps its language
    public async use(language: Language): Promise<void> {
        const shown: Language = this.language();
        if (language === shown) {
            // Already shown: a pick loading meanwhile is dropped
            this.picked.set(null);
            return;
        }
        this.picked.set(language);
        const loaded: boolean = await this.load([language, ...LanguageService.scopePaths(language, Object.values(TranslationScope))]);
        if (this.picked() !== language) {
            // Picked again meanwhile: the last pick shows
            return;
        }
        if (loaded) {
            this.transloco.setActiveLang(language);
            this.store(language);
        } else if (this.language() !== shown) {
            // Transloco shows by itself the language of a load succeeding after a failed one: the global texts of the
            // language picked, one of its scopes failing
            this.transloco.setActiveLang(shown);
        }
        this.picked.set(null);
    }

    // Loads the scopes of a page in the active language before it shows (translationScopesGuard), telling whether they
    // loaded
    public loadScopes(scopes: ReadonlyArray<TranslationScope>): Promise<boolean> {
        return this.load(LanguageService.scopePaths(this.language(), scopes));
    }

    // The paths of the translations of scopes in a language, as Transloco loads them
    private static scopePaths(language: Language, scopes: ReadonlyArray<TranslationScope>): string[] {
        return scopes.map((scope: TranslationScope) => `${ scope }/${ language }`);
    }

    // A translation fails to load when its chunk is gone, e.g. one of a former deployment
    private async load(paths: ReadonlyArray<string>): Promise<boolean> {
        try {
            await firstValueFrom(forkJoin(paths.map((path: string) => this.transloco.load(path))));
            return true;
        } catch {
            return false;
        }
    }

    // The local storage can be unavailable (blocked by the browser): the language then follows the browser, and a pick
    // lasts until the page leaves
    private storedLanguage(): Language | undefined {
        try {
            const stored = this.window.localStorage.getItem(LanguageService.storageKey) as Language;
            return objectHasValue(Language, stored) ? stored : undefined;
        } catch {
            return undefined;
        }
    }

    private store(language: Language): void {
        try {
            this.window.localStorage.setItem(LanguageService.storageKey, language);
        } catch {
            // Not stored, see storedLanguage
        }
    }
}
