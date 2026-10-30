import { TestBed } from '@angular/core/testing';
import { maskOffensiveWords, OffensiveWords } from './offensive-words';
import { offensiveWordsChunk, OffensiveWordsService } from './offensive-words.service';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('OffensiveWordsService', () => {
    let service: OffensiveWordsService;

    beforeEach(() => {
        // The service itself, not the mock of the specs
        TestBed.configureTestingModule({ providers: [OffensiveWordsService] });
        service = TestBed.inject(OffensiveWordsService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should have no offensive words until loaded', () => {
        // Then
        expect(service.words()).toBeUndefined();
    });

    test('should load the lists of every language', async () => {
        // When
        const loaded: boolean = await service.load();

        // Then
        expect(loaded).toEqual(true);
        const words: OffensiveWords = service.words() as OffensiveWords;
        expect(['fuck', 'merde', 'gilipollas', 'caralho', 'fotze', 'хуй', 'orospu', 'kontol', 'kurwa', 'cazzo']
            .map((text: string) => maskOffensiveWords(text, words)))
            .toEqual(['f***', 'm****', 'g*********', 'c******', 'f****', 'х**', 'o*****', 'k*****', 'k****', 'c****']);
    });

    test('should load the lists once', async () => {
        // Given
        await service.load();
        const words: OffensiveWords | undefined = service.words();
        const load = vi.spyOn(offensiveWordsChunk, 'load');

        // When
        const loaded: boolean = await service.load();

        // Then
        expect(loaded).toEqual(true);
        expect(service.words()).toBe(words);
        expect(load).not.toHaveBeenCalled();
    });

    test('should tell the lists failed to load, and load them when asked again', async () => {
        // Given
        vi.spyOn(offensiveWordsChunk, 'load').mockRejectedValueOnce(new Error('chunk gone'));

        // When
        const loaded: boolean = await service.load();

        // Then
        expect(loaded).toEqual(false);
        expect(service.words()).toBeUndefined();

        // When
        const loadedAgain: boolean = await service.load();

        // Then
        expect(loadedAgain).toEqual(true);
        expect(service.words()).toBeDefined();
    });
});
