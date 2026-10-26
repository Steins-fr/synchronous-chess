import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Translation, TranslocoService } from '@jsverse/transloco';
import { defer, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
    function createService(): LanguageService {
        const service: LanguageService = TestBed.inject(LanguageService);
        TestBed.tick();
        return service;
    }

    function browserLanguages(...languages: string[]): void {
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
    }

    // From now on, these translations (a language, or a scope in a language) fail to load, as when their chunk is gone
    function failToLoad(...paths: string[]): void {
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        const load = transloco.load.bind(transloco);
        vi.spyOn(transloco, 'load').mockImplementation((path: string): Observable<Translation> =>
            paths.includes(path) ? throwError(() => new Error('Chunk not found')) : load(path));
    }

    // From now on, each translation loads once its subject completes
    function loadSlowly(): Map<string, Subject<Translation>> {
        const loads = new Map<string, Subject<Translation>>();
        vi.spyOn(TestBed.inject(TranslocoService), 'load').mockImplementation((path: string): Observable<Translation> => {
            const loaded = new Subject<Translation>();
            loads.set(path, loaded);
            return loaded;
        });
        return loads;
    }

    // The translations of a language picked load: its global texts and the texts of every game
    function finishLoading(loads: Map<string, Subject<Translation>>, language: Language): void {
        [language, ...Object.values(TranslationScope).map((scope: TranslationScope) => `${ scope }/${ language }`)].forEach((path: string) => {
            loads.get(path)?.next({});
            loads.get(path)?.complete();
        });
    }

    function blockStorage(): void {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
    }

    function storedLanguage(): string | null {
        return localStorage.getItem(LanguageService.storageKey);
    }

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        document.documentElement.removeAttribute('lang');
    });

    test('should show the first language of the browser the app speaks, and name the page in it', () => {
        // Given
        browserLanguages('ja-JP', 'fr-CA', 'en-US');

        // When
        const service: LanguageService = createService();

        // Then
        expect(service.language()).toBe(Language.FR);
        expect(TestBed.inject(TranslocoService).getActiveLang()).toBe(Language.FR);
        expect(document.documentElement.lang).toBe(Language.FR);
        expect(TestBed.inject(Title).getTitle()).toBe('Échecs synchrones');
    });

    test.each([
        { languages: ['FR'], language: Language.FR },
        { languages: ['en-GB', 'fr'], language: Language.EN },
        { languages: ['es-MX'], language: Language.ES },
        { languages: ['pt'], language: Language.PT_BR },
        { languages: ['pt-br'], language: Language.PT_BR },
        { languages: ['pt-PT'], language: Language.PT_PT },
        { languages: ['pt-AO'], language: Language.PT_PT },
        { languages: ['ja', 'zh-CN'], language: Language.EN },
        { languages: [], language: Language.EN },
    ])('should match the browser languages $languages on their full code, then on their base language', ({ languages, language }) => {
        // Given
        browserLanguages(...languages);

        // When
        const service: LanguageService = createService();

        // Then
        expect(service.language()).toBe(language);
    });

    test('should show the language picked before, whatever the languages of the browser', () => {
        // Given
        browserLanguages('en-US');
        localStorage.setItem(LanguageService.storageKey, Language.FR);

        // When
        const service: LanguageService = createService();

        // Then
        expect(service.language()).toBe(Language.FR);
    });

    test('should follow the browser when the stored language is unknown', () => {
        // Given
        browserLanguages('fr-FR');
        localStorage.setItem(LanguageService.storageKey, 'klingon');

        // When
        const service: LanguageService = createService();

        // Then
        expect(service.language()).toBe(Language.FR);
    });

    test('should switch to the language picked once loaded, and keep it', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();

        // When
        await service.use(Language.FR);
        TestBed.tick();

        // Then
        expect(service.language()).toBe(Language.FR);
        expect(storedLanguage()).toBe(Language.FR);
        expect(document.documentElement.lang).toBe(Language.FR);
        expect(TestBed.inject(Title).getTitle()).toBe('Échecs synchrones');
    });

    test('should keep its language when the language picked fails to load', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        failToLoad(Language.FR);

        // When
        await service.use(Language.FR);

        // Then
        expect(service.language()).toBe(Language.EN);
        expect(storedLanguage()).toBeNull();
    });

    test('should load the scopes of a page in its language, telling whether they loaded', async () => {
        // Given
        browserLanguages('fr-FR');
        const service: LanguageService = createService();
        failToLoad(`${ TranslationScope.CHAT }/${ Language.FR }`);

        // When
        const loaded: boolean = await service.loadScopes([TranslationScope.CHESS]);
        const failed: boolean = await service.loadScopes([TranslationScope.CHESS, TranslationScope.CHAT]);

        // Then
        expect(loaded).toBe(true);
        expect(failed).toBe(false);
        expect(TestBed.inject(TranslocoService).load).toHaveBeenCalledWith(`${ TranslationScope.CHESS }/${ Language.FR }`);
        expect(TestBed.inject(TranslocoService).load).toHaveBeenCalledWith(`${ TranslationScope.CHAT }/${ Language.FR }`);
    });

    test('should switch to the language picked once the texts of every game are loaded in it', async () => {
        // Given: no page shows a game yet, the next one opening while the language loads
        browserLanguages('en-US');
        const service: LanguageService = createService();
        const load = vi.spyOn(TestBed.inject(TranslocoService), 'load');

        // When
        await service.use(Language.FR);

        // Then
        expect(load).toHaveBeenNthCalledWith(1, Language.FR);
        expect(load).toHaveBeenNthCalledWith(2, `${ TranslationScope.CHESS }/${ Language.FR }`);
        expect(load).toHaveBeenNthCalledWith(3, `${ TranslationScope.CHAT }/${ Language.FR }`);
        expect(load).toHaveBeenNthCalledWith(4, `${ TranslationScope.POKER }/${ Language.FR }`);
        expect(load).toHaveBeenNthCalledWith(5, `${ TranslationScope.ROULETTE }/${ Language.FR }`);
        expect(load).toHaveBeenNthCalledWith(6, `${ TranslationScope.CARDS }/${ Language.FR }`);
        expect(service.language()).toBe(Language.FR);
    });

    test('should keep its language when a scope fails to load in the language picked', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        failToLoad(`${ TranslationScope.CHESS }/${ Language.FR }`);

        // When
        await service.use(Language.FR);

        // Then
        expect(service.language()).toBe(Language.EN);
        expect(service.switching()).toBe(false);
    });

    test('should keep its language when Transloco shows the language picked by itself, a scope failing to load', async () => {
        // Given: Transloco shows the language of a load succeeding after a failed one, once. Each time, the title would
        // load the language again, showing it again, without end
        browserLanguages('en-US');
        const service: LanguageService = createService();
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        let recovered: boolean = false;
        vi.spyOn(transloco, 'load').mockImplementation((path: string): Observable<Translation> => {
            if (path !== Language.FR) {
                return throwError(() => new Error('Chunk not found'));
            }
            return defer(() => {
                if (!recovered) {
                    recovered = true;
                    transloco.setActiveLang(Language.FR);
                }
                return of({});
            });
        });

        // When
        await service.use(Language.FR);

        // Then
        expect(service.language()).toBe(Language.EN);
        expect(storedLanguage()).toBeNull();
    });

    test('should leave the language shown when picked again, dropping a pick loading meanwhile', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        const loads: Map<string, Subject<Translation>> = loadSlowly();
        const switched: Promise<void> = service.use(Language.FR);
        const setActiveLang = vi.spyOn(TestBed.inject(TranslocoService), 'setActiveLang');

        // When
        await service.use(Language.EN);
        finishLoading(loads, Language.FR);
        await switched;

        // Then
        expect(service.language()).toBe(Language.EN);
        expect(service.switching()).toBe(false);
        expect(setActiveLang).not.toHaveBeenCalled();
        expect(storedLanguage()).toBeNull();
    });

    test('should name the page in its language once a language failed to load at its start', async () => {
        // Given: the language of the browser fails to load, the app showing English
        browserLanguages('fr-FR');
        failToLoad(Language.FR);
        const service: LanguageService = createService();
        await service.preload();
        TestBed.tick();
        expect(TestBed.inject(Title).getTitle()).toBe('Synchronous Chess');
        vi.restoreAllMocks();

        // When
        await service.use(Language.FR);
        TestBed.tick();

        // Then
        expect(TestBed.inject(Title).getTitle()).toBe('Échecs synchrones');
    });

    test('should tell a language picked loads, until it shows', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        const loads: Map<string, Subject<Translation>> = loadSlowly();

        // When
        const switched: Promise<void> = service.use(Language.FR);

        // Then
        expect(service.switching()).toBe(true);
        expect(service.language()).toBe(Language.EN);

        // When
        finishLoading(loads, Language.FR);
        await switched;

        // Then
        expect(service.switching()).toBe(false);
        expect(service.language()).toBe(Language.FR);
    });

    test.each<[string, Language[]]>([
        ['the first one loading first', [Language.FR, Language.DE]],
        ['the last one loading first', [Language.DE, Language.FR]],
    ])('should show the last language picked while another one loads, %s', async (_case: string, loadOrder: Language[]) => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        const loads: Map<string, Subject<Translation>> = loadSlowly();
        const switches: Promise<void>[] = [service.use(Language.FR), service.use(Language.DE)];

        // When
        loadOrder.forEach((language: Language) => finishLoading(loads, language));
        await Promise.all(switches);

        // Then
        expect(service.language()).toBe(Language.DE);
        expect(service.switching()).toBe(false);
        expect(storedLanguage()).toBe(Language.DE);
    });

    test('should show the language another tab picked, once loaded', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();

        // When
        localStorage.setItem(LanguageService.storageKey, Language.FR);
        window.dispatchEvent(new StorageEvent('storage', { key: LanguageService.storageKey }));

        // Then
        await vi.waitFor(() => expect(service.language()).toBe(Language.FR));
    });

    test.each<[string, string | null]>([
        ['clears the storage', null],
        ['stores another preference', 'theme'],
    ])('should keep its language when another tab %s', async (_case: string, key: string | null) => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        localStorage.setItem('theme', 'dark');
        const use = vi.spyOn(service, 'use');

        // When
        window.dispatchEvent(new StorageEvent('storage', { key }));

        // Then
        expect(use).not.toHaveBeenCalled();
        expect(service.language()).toBe(Language.EN);
    });

    test('should preload its language', async () => {
        // Given
        browserLanguages('fr-FR');
        const service: LanguageService = createService();
        const load = vi.spyOn(TestBed.inject(TranslocoService), 'load');

        // When
        await service.preload();

        // Then
        expect(load).toHaveBeenCalledExactlyOnceWith(Language.FR);
        expect(service.language()).toBe(Language.FR);
    });

    test('should show English when its language fails to preload', async () => {
        // Given
        browserLanguages('fr-FR');
        const service: LanguageService = createService();
        failToLoad(Language.FR);

        // When
        await service.preload();

        // Then
        expect(service.language()).toBe(Language.EN);
    });

    test('should keep English when English fails to preload, the texts showing their keys', async () => {
        // Given
        browserLanguages('en-US');
        const service: LanguageService = createService();
        failToLoad(Language.EN);

        // When
        await service.preload();

        // Then
        expect(TestBed.inject(TranslocoService).load).toHaveBeenCalledOnce();
        expect(service.language()).toBe(Language.EN);
    });

    test('should follow the browser, and switch without keeping the pick, when the storage is blocked', async () => {
        // Given
        browserLanguages('fr-FR');
        blockStorage();
        const service: LanguageService = createService();

        // When
        await service.use(Language.EN);

        // Then
        expect(service.language()).toBe(Language.EN);
        vi.restoreAllMocks();
        expect(storedLanguage()).toBeNull();
    });
});
