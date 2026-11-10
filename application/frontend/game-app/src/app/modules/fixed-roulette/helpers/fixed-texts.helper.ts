import { signed, SignedAmount } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { FixedRouletteEvent, FixedRouletteEventKind, FixedRouletteResult, MatchEnd, SettledEvent } from '../classes/rules/fixed-roulette-game-state';
import { Side } from '../classes/rules/fixed-roulette-rules';
import { netOf } from '../classes/rules/settlement';

/** A game of the match over: settled, or ending the match on a player late or cheating */
export type GameOverEvent = Extract<FixedRouletteEvent, { readonly kind: FixedRouletteEventKind.SETTLED | FixedRouletteEventKind.LATE | FixedRouletteEventKind.CHEATED }>;

const key = (text: string): string => scopedKey(TranslationScope.FIXED, text);

/** Whether an event ends a game: the history of the match tells these ones */
export function isGameOver(event: Readonly<FixedRouletteEvent>): event is GameOverEvent {
    return event.kind === FixedRouletteEventKind.SETTLED || event.kind === FixedRouletteEventKind.LATE || event.kind === FixedRouletteEventKind.CHEATED;
}

/** A line of the history of the match: a game over, its players named */
export function eventText(event: Readonly<GameOverEvent>, names: ReadonlyArray<string>): TranslatableText {
    switch (event.kind) {
        case FixedRouletteEventKind.SETTLED:
            return settledText(event, names);
        case FixedRouletteEventKind.LATE:
            return { key: key(marker('table.move.late', undefined, 'fixed')), params: { number: event.round + 1, name: names[event.player], phase: event.phase } };
        case FixedRouletteEventKind.CHEATED:
            return { key: key(marker('table.move.cheated', undefined, 'fixed')), params: { number: event.round + 1, name: names[event.player], reason: event.reason } };
    }
}

/** A game settled: the pocket of the ball, who bet on it, and what each player won or lost, each net with its own plural */
export function settledText(event: Readonly<SettledEvent>, names: ReadonlyArray<string>): TranslatableText {
    const croupier: Readonly<SignedAmount> = signed(netOf(event.settlement, event.bets, Side.CROUPIER));
    const punter: Readonly<SignedAmount> = signed(netOf(event.settlement, event.bets, Side.PUNTER));
    return {
        key: key(marker('table.move.settled', undefined, 'fixed')),
        params: {
            number: event.round + 1,
            ball: event.ball,
            case: event.settlement.kind,
            croupier: names[event.croupier],
            croupierSign: croupier.sign,
            croupierNet: croupier.amount,
            punter: names[1 - event.croupier],
            punterSign: punter.sign,
            punterNet: punter.amount,
        },
    };
}

/** The result of a match: its winner and why, or a draw on equal chips */
export function resultText(result: Readonly<FixedRouletteResult>, names: ReadonlyArray<string>): TranslatableText {
    if (result.winner === null) {
        return { key: key(marker('table.result.draw', undefined, 'fixed')), params: { chips: result.chips[0] } };
    }
    const winner: number = result.winner;
    const params = { winner: names[winner], loser: names[1 - winner] };

    switch (result.end) {
        case MatchEnd.GAMES:
            return { key: key(marker('table.result.games', undefined, 'fixed')), params: { ...params, winnerChips: result.chips[winner], loserChips: result.chips[1 - winner] } };
        case MatchEnd.BANKRUPT:
            return { key: key(marker('table.result.bankrupt', undefined, 'fixed')), params };
        case MatchEnd.FORFEIT:
            return { key: key(marker('table.result.forfeit', undefined, 'fixed')), params: { ...params, cause: result.cause } };
        case MatchEnd.CHEAT:
            return { key: key(marker('table.result.cheat', undefined, 'fixed')), params: { ...params, cause: result.cause } };
    }
}
