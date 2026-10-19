import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Translation, TranslocoService } from '@jsverse/transloco';
import { Observable, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Language } from './enums/language.enum';
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

    // From now on, the translations of these languages fail to load, as when their chunk is gone
    function failToLoad(...languages: Language[]): void {
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        const load = transloco.load.bind(transloco);
        vi.spyOn(transloco, 'load').mockImplementation((language: string): Observable<Translation> =>
            languages.includes(language as Language) ? throwError(() => new Error('Chunk not found')) : load(language));
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
