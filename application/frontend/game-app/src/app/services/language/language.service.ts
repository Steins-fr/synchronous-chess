import { computed, DOCUMENT, effect, inject, Injectable, Signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { translateSignal, TranslocoService } from '@jsverse/transloco';
import { objectHasValue } from '@app/helpers/object.helper';
import { firstValueFrom } from 'rxjs';
import { Language } from './enums/language.enum';

/**
 * The language of the app: the one the user picked, kept in the local storage, else the first language of the browser the
 * app speaks, else English. Switching it translates the texts shown, without a reload: a reload would reconnect the peers
 * of a match. The lang attribute of the html element and the title of the page follow it.
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

    public constructor() {
        this.transloco.setActiveLang(this.storedLanguage() ?? LanguageService.browserLanguage(this.window.navigator.languages));

        const title = inject(Title);
        const appTitle: Signal<string> = translateSignal('app.title');
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
        const loaded: boolean = await this.load(this.language());
        if (!loaded && this.language() !== Language.EN) {
            this.transloco.setActiveLang(Language.EN);
            await this.load(Language.EN);
        }
    }

    // Shows the language once loaded, so that no text shows its key meanwhile. Failing, the app keeps its language
    public async use(language: Language): Promise<void> {
        if (await this.load(language)) {
            this.transloco.setActiveLang(language);
            this.store(language);
        }
    }

    // A translation fails to load when its chunk is gone, e.g. one of a former deployment
    private async load(language: Language): Promise<boolean> {
        try {
            await firstValueFrom(this.transloco.load(language));
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
