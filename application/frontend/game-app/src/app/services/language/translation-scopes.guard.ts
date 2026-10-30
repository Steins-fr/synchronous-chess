import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { TRANSLOCO_SCOPE } from '@jsverse/transloco';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';
import { TranslationScope } from './enums/translation-scope.enum';
import { LanguageService } from './language.service';

/**
 * Loads the translations of the scopes of a route (provideTranslocoScope) in the active language before its page shows,
 * as the app loads its global texts before it starts (LanguageService.preload), and with the chat, the lists of the
 * offensive words: the first render of the page has the texts of its games, the views and the queries in their
 * translations included, and its chat masks the offensive words of its first messages. Failing, the navigation is
 * cancelled: the page would show without its texts, the app stays on its page, and the next navigation to it loads them
 * again
 */
export const translationScopesGuard: CanActivateFn = async (): Promise<boolean> => {
    // provideTranslocoScope provides each scope apart (multi): the token gives the list of the scopes of the route
    const scopes = inject(TRANSLOCO_SCOPE) as unknown as ReadonlyArray<TranslationScope>;
    // Every service injected before the first await, in the injection context
    const loads: Promise<boolean>[] = [inject(LanguageService).loadScopes(scopes)];
    if (scopes.includes(TranslationScope.CHAT)) {
        loads.push(inject(OffensiveWordsService).load());
    }
    return (await Promise.all(loads)).every(Boolean);
};
