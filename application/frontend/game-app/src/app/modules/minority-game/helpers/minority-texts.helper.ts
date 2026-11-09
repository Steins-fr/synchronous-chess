import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { CastVote, MinorityEvent, MinorityEventKind, MinorityPhase, MissedReason, RoundPoints } from '../classes/rules/minority-game-state';
import { MinorityVariant, Vote } from '../classes/rules/minority-rules';

/** A count of the votes of a question */
export type CountedEvent = Extract<MinorityEvent, { kind: MinorityEventKind.COUNTED }>;

/** The text of a question as the local player reads it: its offensive words masked, while the setting hides them */
export type Mask = (text: string) => string;

const key = (text: string): string => scopedKey(TranslationScope.MINORITY, text);

/** The names of players, joined */
const named = (players: ReadonlyArray<number>, names: ReadonlyArray<string>): string => players.map((player: number) => names[player]).join(', ');

/** A line of the history of the game: an event, its players named, its question as the local player reads it */
export function eventText(event: Readonly<MinorityEvent>, names: ReadonlyArray<string>, variant: MinorityVariant, mask: Mask): TranslatableText {
    switch (event.kind) {
        case MinorityEventKind.ASKED:
            return { key: key(marker('table.move.asked', undefined, 'minority')), params: { round: event.round + 1, name: names[event.asker], question: mask(event.question) } };
        case MinorityEventKind.ASKER_LATE:
            return { key: key(marker('table.move.askerLate', undefined, 'minority')), params: { round: event.round + 1, name: names[event.asker] } };
        case MinorityEventKind.MISSED:
            return missedText(event.reason, event.phase, named(event.players, names));
        case MinorityEventKind.COUNTED:
            return countText(event, names, variant);
    }
}

/** The votes counted, and what became of the players: the eliminated ones, or the points of each one */
export function countText(event: Readonly<CountedEvent>, names: ReadonlyArray<string>, variant: MinorityVariant): TranslatableText {
    const yes: number = event.votes.filter((cast: Readonly<CastVote>) => cast.vote === Vote.YES).length;
    const params = { round: event.round + 1, yes, no: event.votes.length - yes };

    if (variant === MinorityVariant.ELIMINATION) {
        return event.eliminated.length === 0
            ? { key: key(marker('table.move.spared', undefined, 'minority')), params }
            : { key: key(marker('table.move.eliminated', undefined, 'minority')), params: { ...params, names: named(event.eliminated, names) } };
    }
    return event.points.length === 0
        ? { key: key(marker('table.move.noScore', undefined, 'minority')), params }
        : {
            key: key(marker('table.move.scored', undefined, 'minority')),
            params: { ...params, points: event.points.map((scored: Readonly<RoundPoints>) => `${ names[scored.player] } ${ scored.points > 0 ? '+' : '' }${ scored.points }`).join(', ') },
        };
}

/** Players whose vote did not count: late, a reveal not matching its commitment, neither yes nor no */
function missedText(reason: MissedReason, phase: MinorityPhase, names: string): TranslatableText {
    switch (reason) {
        case MissedReason.LATE:
            return phase === MinorityPhase.REVEALING
                ? { key: key(marker('table.move.lateReveal', undefined, 'minority')), params: { names } }
                : { key: key(marker('table.move.late', undefined, 'minority')), params: { names } };
        case MissedReason.INVALID:
            return { key: key(marker('table.move.invalid', undefined, 'minority')), params: { names } };
        case MissedReason.ILLEGAL:
            return { key: key(marker('table.move.illegal', undefined, 'minority')), params: { names } };
    }
}
