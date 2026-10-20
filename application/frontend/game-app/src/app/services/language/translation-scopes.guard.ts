import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { TRANSLOCO_SCOPE } from '@jsverse/transloco';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';

/**
 * Loads the translations of the scopes of a route (provideTranslocoScope) in the active language before its page shows,
 * as the app loads its global texts before it starts (LanguageService.preload): the first render of the page has the texts
 * of its games, the views and the queries in their translations included. A guard rather than a resolver: the router runs
 * the guards of a route together, so the translations load while the APIs are checked (apiHealthGuard). Failing, the page
 * shows anyway
 */
export const translationScopesGuard: CanActivateFn = async (): Promise<true> => {
    // provideTranslocoScope provides each scope apart (multi): the token gives the list of the scopes of the route
    const scopes = inject(TRANSLOCO_SCOPE) as unknown as ReadonlyArray<TranslationScope>;
    await inject(LanguageService).loadScopes(scopes);
    return true;
};
