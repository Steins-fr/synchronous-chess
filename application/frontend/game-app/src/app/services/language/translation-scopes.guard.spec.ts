import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';
import { TestHelper } from '@testing/test.helper';
import { describe, expect, test, vi } from 'vitest';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';
import { translationScopesGuard } from './translation-scopes.guard';

describe('translationScopesGuard', () => {
    test('should let the page show once the scopes of the route are loaded', async () => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)] });
        const loadScopes = vi.spyOn(TestBed.inject(LanguageService), 'loadScopes').mockResolvedValue();

        // When
        const guarded: unknown = await TestBed.runInInjectionContext(() => translationScopesGuard(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        ));

        // Then
        expect(guarded).toBe(true);
        expect(loadScopes).toHaveBeenCalledExactlyOnceWith([TranslationScope.CHESS, TranslationScope.CHAT]);
    });
});
