import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';
import { TestHelper } from '@testing/test.helper';
import { describe, expect, test, vi } from 'vitest';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';
import { translationScopesGuard } from './translation-scopes.guard';

describe('translationScopesGuard', () => {
    test.each<[string, ReadonlyArray<TranslationScope>, boolean, boolean, boolean]>([
        ['show the page once the scopes of the route and the offensive words are loaded', [TranslationScope.CHESS, TranslationScope.CHAT], true, true, true],
        ['cancel the navigation when a scope of the route fails to load', [TranslationScope.CHESS, TranslationScope.CHAT], false, true, false],
        ['cancel the navigation when the offensive words fail to load', [TranslationScope.CHESS, TranslationScope.CHAT], true, false, false],
        ['show a page without chat without the offensive words', [TranslationScope.CHESS], true, false, true],
    ])('should %s', async (_case: string, scopes: ReadonlyArray<TranslationScope>, scopesLoaded: boolean, wordsLoaded: boolean, expected: boolean) => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(...scopes)] });
        const loadScopes = vi.spyOn(TestBed.inject(LanguageService), 'loadScopes').mockResolvedValue(scopesLoaded);
        const loadWords = vi.spyOn(TestBed.inject(OffensiveWordsService), 'load');
        if (!wordsLoaded) {
            loadWords.mockResolvedValue(false);
        }

        // When
        const guarded: unknown = await TestBed.runInInjectionContext(() => translationScopesGuard(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        ));

        // Then
        expect(guarded).toBe(expected);
        expect(loadScopes).toHaveBeenCalledExactlyOnceWith(scopes);
        expect(loadWords).toHaveBeenCalledTimes(scopes.includes(TranslationScope.CHAT) ? 1 : 0);
    });
});
