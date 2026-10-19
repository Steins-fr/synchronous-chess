import { Provider, EnvironmentProviders, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { Language } from '@app/services/language/enums/language.enum';
import { ThrowingMissingHandler } from '@testing/throwing-missing-handler';
import en from './i18n/en.json';
import fr from './i18n/fr.json';
import es from './i18n/es.json';
import ptBR from './i18n/pt-BR.json';
import ptPT from './i18n/pt-PT.json';

const testProviders: (Provider | EnvironmentProviders)[] = [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    provideHttpClientTesting(),
    provideRouter([]),
    // The specs find the elements by their English text. Every language is loaded, for the specs switching to one
    importProvidersFrom(TranslocoTestingModule.forRoot({
        langs: {
            [Language.EN]: en,
            [Language.FR]: fr,
            [Language.ES]: es,
            [Language.PT_BR]: ptBR,
            [Language.PT_PT]: ptPT,
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
