import { Provider, EnvironmentProviders, importProvidersFrom, provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideTranslocoMissingHandler, Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { Language } from '@app/services/language/enums/language.enum';
import { TranslationPath } from '@app/services/language/translation.loader';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
import { OffensiveWordsMock } from '@testing/offensive-words.mock';
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
import enPokerTranslation from './i18n/poker/en.json';
import frPokerTranslation from './i18n/poker/fr.json';
import esPokerTranslation from './i18n/poker/es.json';
import ptBRPokerTranslation from './i18n/poker/pt-BR.json';
import ptPTPokerTranslation from './i18n/poker/pt-PT.json';
import dePokerTranslation from './i18n/poker/de.json';
import ruPokerTranslation from './i18n/poker/ru.json';
import trPokerTranslation from './i18n/poker/tr.json';
import idPokerTranslation from './i18n/poker/id.json';
import plPokerTranslation from './i18n/poker/pl.json';
import itPokerTranslation from './i18n/poker/it.json';
import enRouletteTranslation from './i18n/roulette/en.json';
import frRouletteTranslation from './i18n/roulette/fr.json';
import esRouletteTranslation from './i18n/roulette/es.json';
import ptBRRouletteTranslation from './i18n/roulette/pt-BR.json';
import ptPTRouletteTranslation from './i18n/roulette/pt-PT.json';
import deRouletteTranslation from './i18n/roulette/de.json';
import ruRouletteTranslation from './i18n/roulette/ru.json';
import trRouletteTranslation from './i18n/roulette/tr.json';
import idRouletteTranslation from './i18n/roulette/id.json';
import plRouletteTranslation from './i18n/roulette/pl.json';
import itRouletteTranslation from './i18n/roulette/it.json';
import enBidTranslation from './i18n/bid/en.json';
import frBidTranslation from './i18n/bid/fr.json';
import esBidTranslation from './i18n/bid/es.json';
import ptBRBidTranslation from './i18n/bid/pt-BR.json';
import ptPTBidTranslation from './i18n/bid/pt-PT.json';
import deBidTranslation from './i18n/bid/de.json';
import ruBidTranslation from './i18n/bid/ru.json';
import trBidTranslation from './i18n/bid/tr.json';
import idBidTranslation from './i18n/bid/id.json';
import plBidTranslation from './i18n/bid/pl.json';
import itBidTranslation from './i18n/bid/it.json';
import enMinorityTranslation from './i18n/minority/en.json';
import frMinorityTranslation from './i18n/minority/fr.json';
import esMinorityTranslation from './i18n/minority/es.json';
import ptBRMinorityTranslation from './i18n/minority/pt-BR.json';
import ptPTMinorityTranslation from './i18n/minority/pt-PT.json';
import deMinorityTranslation from './i18n/minority/de.json';
import ruMinorityTranslation from './i18n/minority/ru.json';
import trMinorityTranslation from './i18n/minority/tr.json';
import idMinorityTranslation from './i18n/minority/id.json';
import plMinorityTranslation from './i18n/minority/pl.json';
import itMinorityTranslation from './i18n/minority/it.json';
import enContrabandTranslation from './i18n/contraband/en.json';
import frContrabandTranslation from './i18n/contraband/fr.json';
import esContrabandTranslation from './i18n/contraband/es.json';
import ptBRContrabandTranslation from './i18n/contraband/pt-BR.json';
import ptPTContrabandTranslation from './i18n/contraband/pt-PT.json';
import deContrabandTranslation from './i18n/contraband/de.json';
import ruContrabandTranslation from './i18n/contraband/ru.json';
import trContrabandTranslation from './i18n/contraband/tr.json';
import idContrabandTranslation from './i18n/contraband/id.json';
import plContrabandTranslation from './i18n/contraband/pl.json';
import itContrabandTranslation from './i18n/contraband/it.json';
import enEdenTranslation from './i18n/eden/en.json';
import frEdenTranslation from './i18n/eden/fr.json';
import esEdenTranslation from './i18n/eden/es.json';
import ptBREdenTranslation from './i18n/eden/pt-BR.json';
import ptPTEdenTranslation from './i18n/eden/pt-PT.json';
import deEdenTranslation from './i18n/eden/de.json';
import ruEdenTranslation from './i18n/eden/ru.json';
import trEdenTranslation from './i18n/eden/tr.json';
import idEdenTranslation from './i18n/eden/id.json';
import plEdenTranslation from './i18n/eden/pl.json';
import itEdenTranslation from './i18n/eden/it.json';
import enFixedTranslation from './i18n/fixed/en.json';
import frFixedTranslation from './i18n/fixed/fr.json';
import esFixedTranslation from './i18n/fixed/es.json';
import ptBRFixedTranslation from './i18n/fixed/pt-BR.json';
import ptPTFixedTranslation from './i18n/fixed/pt-PT.json';
import deFixedTranslation from './i18n/fixed/de.json';
import ruFixedTranslation from './i18n/fixed/ru.json';
import trFixedTranslation from './i18n/fixed/tr.json';
import idFixedTranslation from './i18n/fixed/id.json';
import plFixedTranslation from './i18n/fixed/pl.json';
import itFixedTranslation from './i18n/fixed/it.json';
import enCardsTranslation from './i18n/cards/en.json';
import frCardsTranslation from './i18n/cards/fr.json';
import esCardsTranslation from './i18n/cards/es.json';
import ptBRCardsTranslation from './i18n/cards/pt-BR.json';
import ptPTCardsTranslation from './i18n/cards/pt-PT.json';
import deCardsTranslation from './i18n/cards/de.json';
import ruCardsTranslation from './i18n/cards/ru.json';
import trCardsTranslation from './i18n/cards/tr.json';
import idCardsTranslation from './i18n/cards/id.json';
import plCardsTranslation from './i18n/cards/pl.json';
import itCardsTranslation from './i18n/cards/it.json';

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
    'poker/en': enPokerTranslation,
    'poker/fr': frPokerTranslation,
    'poker/es': esPokerTranslation,
    'poker/pt-BR': ptBRPokerTranslation,
    'poker/pt-PT': ptPTPokerTranslation,
    'poker/de': dePokerTranslation,
    'poker/ru': ruPokerTranslation,
    'poker/tr': trPokerTranslation,
    'poker/id': idPokerTranslation,
    'poker/pl': plPokerTranslation,
    'poker/it': itPokerTranslation,
    'roulette/en': enRouletteTranslation,
    'roulette/fr': frRouletteTranslation,
    'roulette/es': esRouletteTranslation,
    'roulette/pt-BR': ptBRRouletteTranslation,
    'roulette/pt-PT': ptPTRouletteTranslation,
    'roulette/de': deRouletteTranslation,
    'roulette/ru': ruRouletteTranslation,
    'roulette/tr': trRouletteTranslation,
    'roulette/id': idRouletteTranslation,
    'roulette/pl': plRouletteTranslation,
    'roulette/it': itRouletteTranslation,
    'bid/en': enBidTranslation,
    'bid/fr': frBidTranslation,
    'bid/es': esBidTranslation,
    'bid/pt-BR': ptBRBidTranslation,
    'bid/pt-PT': ptPTBidTranslation,
    'bid/de': deBidTranslation,
    'bid/ru': ruBidTranslation,
    'bid/tr': trBidTranslation,
    'bid/id': idBidTranslation,
    'bid/pl': plBidTranslation,
    'bid/it': itBidTranslation,
    'minority/en': enMinorityTranslation,
    'minority/fr': frMinorityTranslation,
    'minority/es': esMinorityTranslation,
    'minority/pt-BR': ptBRMinorityTranslation,
    'minority/pt-PT': ptPTMinorityTranslation,
    'minority/de': deMinorityTranslation,
    'minority/ru': ruMinorityTranslation,
    'minority/tr': trMinorityTranslation,
    'minority/id': idMinorityTranslation,
    'minority/pl': plMinorityTranslation,
    'minority/it': itMinorityTranslation,
    'contraband/en': enContrabandTranslation,
    'contraband/fr': frContrabandTranslation,
    'contraband/es': esContrabandTranslation,
    'contraband/pt-BR': ptBRContrabandTranslation,
    'contraband/pt-PT': ptPTContrabandTranslation,
    'contraband/de': deContrabandTranslation,
    'contraband/ru': ruContrabandTranslation,
    'contraband/tr': trContrabandTranslation,
    'contraband/id': idContrabandTranslation,
    'contraband/pl': plContrabandTranslation,
    'contraband/it': itContrabandTranslation,
    'eden/en': enEdenTranslation,
    'eden/fr': frEdenTranslation,
    'eden/es': esEdenTranslation,
    'eden/pt-BR': ptBREdenTranslation,
    'eden/pt-PT': ptPTEdenTranslation,
    'eden/de': deEdenTranslation,
    'eden/ru': ruEdenTranslation,
    'eden/tr': trEdenTranslation,
    'eden/id': idEdenTranslation,
    'eden/pl': plEdenTranslation,
    'eden/it': itEdenTranslation,
    'fixed/en': enFixedTranslation,
    'fixed/fr': frFixedTranslation,
    'fixed/es': esFixedTranslation,
    'fixed/pt-BR': ptBRFixedTranslation,
    'fixed/pt-PT': ptPTFixedTranslation,
    'fixed/de': deFixedTranslation,
    'fixed/ru': ruFixedTranslation,
    'fixed/tr': trFixedTranslation,
    'fixed/id': idFixedTranslation,
    'fixed/pl': plFixedTranslation,
    'fixed/it': itFixedTranslation,
    'cards/en': enCardsTranslation,
    'cards/fr': frCardsTranslation,
    'cards/es': esCardsTranslation,
    'cards/pt-BR': ptBRCardsTranslation,
    'cards/pt-PT': ptPTCardsTranslation,
    'cards/de': deCardsTranslation,
    'cards/ru': ruCardsTranslation,
    'cards/tr': trCardsTranslation,
    'cards/id': idCardsTranslation,
    'cards/pl': plCardsTranslation,
    'cards/it': itCardsTranslation,
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
    // The lists of the offensive words loaded, as the translations are: the chat masks at its first render
    { provide: OffensiveWordsService, useFactory: (): OffensiveWordsMock => new OffensiveWordsMock() },
];

export default testProviders;
