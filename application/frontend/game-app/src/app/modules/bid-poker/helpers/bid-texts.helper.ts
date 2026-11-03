import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { Bid, BidEvent, BidEventKind, MissedReason } from '../classes/rules/bid-poker-game';
import { lotLetter } from '../classes/rules/catalogue';

const key = (text: string): string => scopedKey(TranslationScope.BID, text);

/** The names of players, joined */
const named = (players: ReadonlyArray<number>, names: ReadonlyArray<string>): string => players.map((player: number) => names[player]).join(', ');

/** A line of the history of the game: an event, its players named */
export function eventText(event: Readonly<BidEvent>, names: ReadonlyArray<string>): TranslatableText {
    switch (event.kind) {
        case BidEventKind.SOLD: {
            const params = {
                letter: lotLetter(event.lot), name: names[event.winner], price: event.price,
                bids: event.bids.map((bid: Readonly<Bid>) => `${ names[bid.player] } ${ bid.amount }`).join(', '),
            };
            return event.tied.length === 0
                ? { key: key(marker('table.move.sold', undefined, 'bid')), params }
                : { key: key(marker('table.move.soldTie', undefined, 'bid')), params: { ...params, tied: named(event.tied, names) } };
        }
        case BidEventKind.UNSOLD:
            return event.seller === null
                ? { key: key(marker('table.move.unsoldOut', undefined, 'bid')), params: { letter: lotLetter(event.lot) } }
                : { key: key(marker('table.move.unsoldBack', undefined, 'bid')), params: { letter: lotLetter(event.lot), name: names[event.seller] } };
        case BidEventKind.DISCARDS:
            return {
                key: key(marker('table.move.discards', undefined, 'bid')),
                params: { session: event.session, name: names[event.player], count: event.count, letter: lotLetter(event.lot) },
            };
        case BidEventKind.NO_DISCARD:
            return { key: key(marker('table.move.noDiscard', undefined, 'bid')), params: { session: event.session } };
        case BidEventKind.MISSED:
            return missedText(event.reason, event.phase, named(event.players, names));
    }
}

/** Players acting with no bid or no discard: late, a reveal not matching its commitment, against the rules */
function missedText(reason: MissedReason, phase: string, names: string): TranslatableText {
    switch (reason) {
        case MissedReason.LATE:
            return { key: key(marker('table.move.late', undefined, 'bid')), params: { names, phase } };
        case MissedReason.INVALID:
            return { key: key(marker('table.move.invalid', undefined, 'bid')), params: { names } };
        case MissedReason.ILLEGAL:
            return { key: key(marker('table.move.illegal', undefined, 'bid')), params: { names, phase } };
    }
}
