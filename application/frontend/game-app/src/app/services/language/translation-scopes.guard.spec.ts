import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideTranslocoScope, TranslocoService } from '@jsverse/transloco';
import { TestHelper } from '@testing/test.helper';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';
import { translationScopesGuard } from './translation-scopes.guard';

describe('translationScopesGuard', () => {
    function guard(): Promise<unknown> {
        return firstValueFrom(TestBed.runInInjectionContext(() => translationScopesGuard(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        )) as Observable<unknown>);
    }

    test('should let the page show once the scopes of the route are loaded in the active language', async () => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)] });
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setActiveLang(Language.FR);
        const load = vi.spyOn(transloco, 'load').mockReturnValue(of({}));

        // When
        const guarded: unknown = await guard();

        // Then
        expect(guarded).toBe(true);
        expect(load.mock.calls).toEqual([[`${ TranslationScope.CHESS }/${ Language.FR }`], [`${ TranslationScope.CHAT }/${ Language.FR }`]]);
    });

    test('should let the page show when a translation fails to load', async () => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS)] });
        vi.spyOn(TestBed.inject(TranslocoService), 'load').mockReturnValue(throwError(() => new Error('Chunk gone')));

        // When
        const guarded: unknown = await guard();

        // Then
        expect(guarded).toBe(true);
    });
});
