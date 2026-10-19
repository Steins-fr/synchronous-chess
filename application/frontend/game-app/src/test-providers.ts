import { Provider, EnvironmentProviders, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { Language } from '@app/services/language/enums/language.enum';
import { ThrowingMissingHandler } from '@testing/throwing-missing-handler';
import enTranslation from './i18n/en.json';
import frTranslation from './i18n/fr.json';
import esTranslation from './i18n/es.json';
import ptBRTranslation from './i18n/pt-BR.json';
import ptPTTranslation from './i18n/pt-PT.json';
import deTranslation from './i18n/de.json';
import ruTranslation from './i18n/ru.json';
import trTranslation from './i18n/tr.json';

const testProviders: (Provider | EnvironmentProviders)[] = [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    provideHttpClientTesting(),
    provideRouter([]),
    // The specs find the elements by their English text. Every language is loaded, for the specs switching to one
    importProvidersFrom(TranslocoTestingModule.forRoot({
        langs: {
            [Language.EN]: enTranslation,
            [Language.FR]: frTranslation,
            [Language.ES]: esTranslation,
            [Language.PT_BR]: ptBRTranslation,
            [Language.PT_PT]: ptPTTranslation,
            [Language.DE]: deTranslation,
            [Language.RU]: ruTranslation,
            [Language.TR]: trTranslation,
        },
        preloadLangs: true,
        translocoConfig: {
            availableLangs: Object.values(Language),
            defaultLang: Language.EN,
            reRenderOnLangChange: true,
        },
    })),
    provideTranslocoMessageformat(),
    // A key missing from the translation fails its spec
    provideTranslocoMissingHandler(ThrowingMissingHandler),
];

export default testProviders;
