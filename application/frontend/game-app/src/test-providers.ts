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

const testProviders: (Provider | EnvironmentProviders)[] = [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    provideHttpClientTesting(),
    provideRouter([]),
    // The specs find the elements by their English text. French is loaded too, for the specs switching the language
    importProvidersFrom(TranslocoTestingModule.forRoot({
        langs: { [Language.EN]: en, [Language.FR]: fr },
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
