import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { AppleOutcome, CastApple } from '../classes/rules/apple-count';
import { EdenEvent, EdenEventKind, EdenPhase, MissedReason } from '../classes/rules/eden-game-state';
import { Apple, EdenRules } from '../classes/rules/eden-rules';

/** A count of the apples of a round */
export type CountedEvent = Extract<EdenEvent, { kind: EdenEventKind.COUNTED }>;

/** The sign of an amount, a select of its texts: they write the amount without it */
export enum Sign {
    PLUS = 'plus',
    MINUS = 'minus',
    ZERO = 'zero',
}

const key = (text: string): string => scopedKey(TranslationScope.EDEN, text);

/** The names of players, joined */
const named = (players: ReadonlyArray<number>, names: ReadonlyArray<string>): string => players.map((player: number) => names[player]).join(', ');

/** An amount of millions as the texts read it: its sign apart, the amount without it */
export function signed(amount: number): Readonly<{ sign: Sign; amount: number }> {
    if (amount === 0) {
        return { sign: Sign.ZERO, amount: 0 };
    }
    return amount > 0 ? { sign: Sign.PLUS, amount } : { sign: Sign.MINUS, amount: -amount };
}

/** A line of the history of the game: an event, its players named */
export function eventText(event: Readonly<EdenEvent>, names: ReadonlyArray<string>, rules: EdenRules): TranslatableText {
    switch (event.kind) {
        case EdenEventKind.MISSED:
            return missedText(event.reason, event.phase, named(event.players, names), event.amount);
        case EdenEventKind.COUNTED:
            return countText(event, names, rules);
        case EdenEventKind.OUT:
            return { key: key(marker('table.move.out', undefined, 'eden')), params: { round: event.round + 1, names: named(event.players, names), count: event.players.length } };
    }
}

/** The apples counted, by color, and what the apples won or lost: the penalties of the apples missed are told apart */
export function countText(event: Readonly<CountedEvent>, names: ReadonlyArray<string>, rules: EdenRules): TranslatableText {
    const count = (apple: Apple): number => event.votes.filter((cast: Readonly<CastApple>) => cast.apple === apple).length;
    const params = {
        round: event.round + 1, gold: count(Apple.GOLD), silver: count(Apple.SILVER), red: count(Apple.RED),
        gain: rules.gain, name: event.lone === null ? '' : names[event.lone], apple: event.color ?? '',
    };

    switch (event.outcome) {
        case AppleOutcome.NO_VOTE:
            return { key: key(marker('table.move.noVote', undefined, 'eden')), params };
        case AppleOutcome.TIE:
            return { key: key(marker('table.move.tie', undefined, 'eden')), params };
        case AppleOutcome.ONE_COLOR:
            return { key: key(marker('table.move.oneColor', undefined, 'eden')), params };
        case AppleOutcome.MAJORITY:
            return { key: key(marker('table.move.majority', undefined, 'eden')), params };
        case AppleOutcome.ALL_RED:
            return { key: key(marker('table.move.allRed', undefined, 'eden')), params };
        case AppleOutcome.LONE_RED:
            return { key: key(marker('table.move.loneRed', undefined, 'eden')), params: { ...params, loss: rules.loneRedLoss } };
        case AppleOutcome.LONE_APPLE: {
            // The lone gold or silver apple, counted
            const lone: Readonly<CastApple> = event.votes.find((cast: Readonly<CastApple>) => cast.player === event.lone) as CastApple;
            return { key: key(marker('table.move.loneApple', undefined, 'eden')), params: { ...params, apple: lone.apple, bonus: rules.loneGain } };
        }
        case AppleOutcome.MIXED:
            return { key: key(marker('table.move.mixed', undefined, 'eden')), params };
    }
}

/** The seconds left, in minutes and seconds */
export function clockText(seconds: number): TranslatableText {
    return { key: key(marker('table.clock', undefined, 'eden')), params: { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, '0') } };
}

/** Players whose apple did not count, and what each one lost: late, a reveal not matching its commitment, no apple */
function missedText(reason: MissedReason, phase: EdenPhase, names: string, amount: number): TranslatableText {
    switch (reason) {
        case MissedReason.LATE:
            return phase === EdenPhase.REVEALING
                ? { key: key(marker('table.move.lateReveal', undefined, 'eden')), params: { names, amount } }
                : { key: key(marker('table.move.late', undefined, 'eden')), params: { names, amount } };
        case MissedReason.INVALID:
            return { key: key(marker('table.move.invalid', undefined, 'eden')), params: { names, amount } };
        case MissedReason.ILLEGAL:
            return { key: key(marker('table.move.illegal', undefined, 'eden')), params: { names, amount } };
    }
}
