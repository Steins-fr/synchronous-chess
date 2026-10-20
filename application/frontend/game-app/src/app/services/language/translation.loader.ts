import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Language } from './enums/language.enum';
import { TranslationScope } from './enums/translation-scope.enum';

// The path of a translation file, as Transloco asks for it: a language for the global texts, a scope then a language for
// the texts of a game
export type TranslationPath = Language | `${ TranslationScope }/${ Language }`;

// Each translation file is a chunk of its own, hashed by the build: only the active language is loaded, the texts of a
// game with its page only, and a cache never serves a translation older than the code reading it
const translationFiles: Readonly<Record<TranslationPath, () => Promise<{ default: Translation }>>> = {
    [Language.EN]: () => import('../../../i18n/en.json'),
    [Language.FR]: () => import('../../../i18n/fr.json'),
    [Language.ES]: () => import('../../../i18n/es.json'),
    [Language.PT_BR]: () => import('../../../i18n/pt-BR.json'),
    [Language.PT_PT]: () => import('../../../i18n/pt-PT.json'),
    [Language.DE]: () => import('../../../i18n/de.json'),
    [Language.RU]: () => import('../../../i18n/ru.json'),
    [Language.TR]: () => import('../../../i18n/tr.json'),
    [Language.ID]: () => import('../../../i18n/id.json'),
    [Language.PL]: () => import('../../../i18n/pl.json'),
    [Language.IT]: () => import('../../../i18n/it.json'),
    'chess/en': () => import('../../../i18n/chess/en.json'),
    'chess/fr': () => import('../../../i18n/chess/fr.json'),
    'chess/es': () => import('../../../i18n/chess/es.json'),
    'chess/pt-BR': () => import('../../../i18n/chess/pt-BR.json'),
    'chess/pt-PT': () => import('../../../i18n/chess/pt-PT.json'),
    'chess/de': () => import('../../../i18n/chess/de.json'),
    'chess/ru': () => import('../../../i18n/chess/ru.json'),
    'chess/tr': () => import('../../../i18n/chess/tr.json'),
    'chess/id': () => import('../../../i18n/chess/id.json'),
    'chess/pl': () => import('../../../i18n/chess/pl.json'),
    'chess/it': () => import('../../../i18n/chess/it.json'),
    'chat/en': () => import('../../../i18n/chat/en.json'),
    'chat/fr': () => import('../../../i18n/chat/fr.json'),
    'chat/es': () => import('../../../i18n/chat/es.json'),
    'chat/pt-BR': () => import('../../../i18n/chat/pt-BR.json'),
    'chat/pt-PT': () => import('../../../i18n/chat/pt-PT.json'),
    'chat/de': () => import('../../../i18n/chat/de.json'),
    'chat/ru': () => import('../../../i18n/chat/ru.json'),
    'chat/tr': () => import('../../../i18n/chat/tr.json'),
    'chat/id': () => import('../../../i18n/chat/id.json'),
    'chat/pl': () => import('../../../i18n/chat/pl.json'),
    'chat/it': () => import('../../../i18n/chat/it.json'),
};

@Injectable({
    providedIn: 'root',
})
export class TranslationLoader implements TranslocoLoader {
    public async getTranslation(path: string): Promise<Translation> {
        const file = await translationFiles[path as TranslationPath]();
        return file.default;
    }
}
