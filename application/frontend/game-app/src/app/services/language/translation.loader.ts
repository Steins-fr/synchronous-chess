import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Language } from './enums/language.enum';

// Each translation file is a chunk of its own, hashed by the build: only the active language is loaded, and a cache never
// serves a translation older than the code reading it
const translationFiles: Readonly<Record<Language, () => Promise<{ default: Translation }>>> = {
    [Language.EN]: () => import('../../../i18n/en.json'),
    [Language.FR]: () => import('../../../i18n/fr.json'),
    [Language.ES]: () => import('../../../i18n/es.json'),
    [Language.PT_BR]: () => import('../../../i18n/pt-BR.json'),
    [Language.PT_PT]: () => import('../../../i18n/pt-PT.json'),
};

@Injectable({
    providedIn: 'root',
})
export class TranslationLoader implements TranslocoLoader {
    public async getTranslation(language: string): Promise<Translation> {
        const file = await translationFiles[language as Language]();
        return file.default;
    }
}
