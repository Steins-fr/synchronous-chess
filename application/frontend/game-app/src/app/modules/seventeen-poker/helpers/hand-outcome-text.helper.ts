import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { HandValue } from '../classes/rules/hand-evaluator';
import { HandEnd, HandOutcome } from '../classes/rules/poker-match';
import { otherSeat, PokerSeat, SeatPair } from '../classes/rules/poker-seat';

/**
 * How a hand ended, for the history of the table
 * @param index the index of the hand in the match, from 0
 * @param seats the players of each seat
 */
export function handOutcomeText(outcome: Readonly<HandOutcome>, index: number, seats: SeatPair<string | null>): TranslatableText {
    const params: Record<string, unknown> = { index: index + 1, pot: outcome.pot, winner: outcome.winner === null ? null : seats[outcome.winner] };

    switch (outcome.end) {
        case HandEnd.NO_CONTEST:
            return { key: scopedKey(TranslationScope.POKER, marker('table.outcome.noContest', undefined, 'poker')), params };
        case HandEnd.FOLD:
            return {
                key: scopedKey(TranslationScope.POKER, marker('table.outcome.fold', undefined, 'poker')),
                params: { ...params, folder: seats[otherSeat(outcome.winner as PokerSeat)] },
            };
        case HandEnd.SHOWDOWN:
            return outcome.winner === null
                ? { key: scopedKey(TranslationScope.POKER, marker('table.outcome.split', undefined, 'poker')), params: { ...params, category: (outcome.hands as SeatPair<HandValue>)[0].category } }
                : { key: scopedKey(TranslationScope.POKER, marker('table.outcome.win', undefined, 'poker')), params: { ...params, category: (outcome.hands as SeatPair<HandValue>)[outcome.winner].category } };
    }
}
