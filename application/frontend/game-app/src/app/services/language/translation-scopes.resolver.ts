import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { TRANSLOCO_SCOPE, TranslocoService } from '@jsverse/transloco';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { TranslationScope } from './enums/translation-scope.enum';

/**
 * Loads the translations of the scopes of a route (provideTranslocoScope) in the active language before its page shows,
 * as the app loads its global texts before it starts (LanguageService.preload): the first render of the page has the texts
 * of its games, the views and the queries in their translations included. Failing, the page shows anyway
 */
export const translationScopesResolver: ResolveFn<boolean> = (): Observable<boolean> => {
    const transloco = inject(TranslocoService);
    // provideTranslocoScope provides each scope apart (multi): the token gives the list of the scopes of the route
    const scopes = inject(TRANSLOCO_SCOPE) as unknown as ReadonlyArray<TranslationScope>;
    return forkJoin(scopes.map((scope: TranslationScope) => transloco.load(`${ scope }/${ transloco.getActiveLang() }`))).pipe(
        map(() => true),
        catchError(() => of(false)),
    );
};
