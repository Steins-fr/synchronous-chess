import { Provider, EnvironmentProviders, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideTranslocoMissingHandler, Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { Language } from '@app/services/language/enums/language.enum';
import { TranslationPath } from '@app/services/language/translation.loader';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
import { VisitorPresenceMock } from '@testing/visitor-presence.mock';
import { ThrowingMissingHandler } from '@testing/throwing-missing-handler';
import enTranslation from './i18n/en.json';
import frTranslation from './i18n/fr.json';
import esTranslation from './i18n/es.json';
import ptBRTranslation from './i18n/pt-BR.json';
import ptPTTranslation from './i18n/pt-PT.json';
import deTranslation from './i18n/de.json';
import ruTranslation from './i18n/ru.json';
import trTranslation from './i18n/tr.json';
import idTranslation from './i18n/id.json';
import plTranslation from './i18n/pl.json';
import itTranslation from './i18n/it.json';
import enChessTranslation from './i18n/chess/en.json';
import frChessTranslation from './i18n/chess/fr.json';
import esChessTranslation from './i18n/chess/es.json';
import ptBRChessTranslation from './i18n/chess/pt-BR.json';
import ptPTChessTranslation from './i18n/chess/pt-PT.json';
import deChessTranslation from './i18n/chess/de.json';
import ruChessTranslation from './i18n/chess/ru.json';
import trChessTranslation from './i18n/chess/tr.json';
import idChessTranslation from './i18n/chess/id.json';
import plChessTranslation from './i18n/chess/pl.json';
import itChessTranslation from './i18n/chess/it.json';
import enChatTranslation from './i18n/chat/en.json';
import frChatTranslation from './i18n/chat/fr.json';
import esChatTranslation from './i18n/chat/es.json';
import ptBRChatTranslation from './i18n/chat/pt-BR.json';
import ptPTChatTranslation from './i18n/chat/pt-PT.json';
import deChatTranslation from './i18n/chat/de.json';
import ruChatTranslation from './i18n/chat/ru.json';
import trChatTranslation from './i18n/chat/tr.json';
import idChatTranslation from './i18n/chat/id.json';
import plChatTranslation from './i18n/chat/pl.json';
import itChatTranslation from './i18n/chat/it.json';

// Every translation file, the global ones then the ones of each scope
const translations: Readonly<Record<TranslationPath, Translation>> = {
    [Language.EN]: enTranslation,
    [Language.FR]: frTranslation,
    [Language.ES]: esTranslation,
    [Language.PT_BR]: ptBRTranslation,
    [Language.PT_PT]: ptPTTranslation,
    [Language.DE]: deTranslation,
    [Language.RU]: ruTranslation,
    [Language.TR]: trTranslation,
    [Language.ID]: idTranslation,
    [Language.PL]: plTranslation,
    [Language.IT]: itTranslation,
    'chess/en': enChessTranslation,
    'chess/fr': frChessTranslation,
    'chess/es': esChessTranslation,
    'chess/pt-BR': ptBRChessTranslation,
    'chess/pt-PT': ptPTChessTranslation,
    'chess/de': deChessTranslation,
    'chess/ru': ruChessTranslation,
    'chess/tr': trChessTranslation,
    'chess/id': idChessTranslation,
    'chess/pl': plChessTranslation,
    'chess/it': itChessTranslation,
    'chat/en': enChatTranslation,
    'chat/fr': frChatTranslation,
    'chat/es': esChatTranslation,
    'chat/pt-BR': ptBRChatTranslation,
    'chat/pt-PT': ptPTChatTranslation,
    'chat/de': deChatTranslation,
    'chat/ru': ruChatTranslation,
    'chat/tr': trChatTranslation,
    'chat/id': idChatTranslation,
    'chat/pl': plChatTranslation,
    'chat/it': itChatTranslation,
};

const testProviders: (Provider | EnvironmentProviders)[] = [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    provideHttpClientTesting(),
    provideRouter([]),
    // The specs find the elements by their English text. Every language and every scope is loaded, for the specs switching
    // to a language
    importProvidersFrom(TranslocoTestingModule.forRoot({
        langs: translations,
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
    // A person on the pages, acting on them: the pages reach the APIs at once
    { provide: VisitorPresenceService, useFactory: (): VisitorPresenceMock => new VisitorPresenceMock() },
];

export default testProviders;
