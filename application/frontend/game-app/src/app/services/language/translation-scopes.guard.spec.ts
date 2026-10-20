import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { TestHelper } from '@testing/test.helper';
import { describe, expect, test, vi } from 'vitest';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';
import { translationScopesGuard } from './translation-scopes.guard';

describe('translationScopesGuard', () => {
    test.each<[string, boolean]>([
        ['show the page once the scopes of the route are loaded', true],
        ['cancel the navigation when a scope of the route fails to load', false],
    ])('should %s', async (_case: string, loaded: boolean) => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)] });
        const loadScopes = vi.spyOn(TestBed.inject(LanguageService), 'loadScopes').mockResolvedValue(loaded);

        // When
        const guarded: unknown = await TestBed.runInInjectionContext(() => translationScopesGuard(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        ));

        // Then
        expect(guarded).toBe(loaded);
        expect(loadScopes).toHaveBeenCalledExactlyOnceWith([TranslationScope.CHESS, TranslationScope.CHAT]);
    });
});
