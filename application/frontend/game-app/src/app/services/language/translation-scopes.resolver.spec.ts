import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { provideTranslocoScope, TranslocoService } from '@jsverse/transloco';
import { TestHelper } from '@testing/test.helper';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';
import { translationScopesResolver } from './translation-scopes.resolver';

describe('translationScopesResolver', () => {
    function resolve(): Promise<boolean> {
        return firstValueFrom(TestBed.runInInjectionContext(() => translationScopesResolver(
            TestHelper.cast<ActivatedRouteSnapshot>({}),
            TestHelper.cast<RouterStateSnapshot>({}),
        )) as Observable<boolean>);
    }

    test('should load the scopes of the route in the active language before its page shows', async () => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS, TranslationScope.CHAT)] });
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setActiveLang(Language.FR);
        const load = vi.spyOn(transloco, 'load').mockReturnValue(of({}));

        // When
        const resolved: boolean = await resolve();

        // Then
        expect(resolved).toBe(true);
        expect(load.mock.calls).toEqual([[`${ TranslationScope.CHESS }/${ Language.FR }`], [`${ TranslationScope.CHAT }/${ Language.FR }`]]);
    });

    test('should show the page when a translation fails to load', async () => {
        // Given
        TestBed.configureTestingModule({ providers: [provideTranslocoScope(TranslationScope.CHESS)] });
        vi.spyOn(TestBed.inject(TranslocoService), 'load').mockReturnValue(throwError(() => new Error('Chunk gone')));

        // When
        const resolved: boolean = await resolve();

        // Then
        expect(resolved).toBe(false);
    });
});
