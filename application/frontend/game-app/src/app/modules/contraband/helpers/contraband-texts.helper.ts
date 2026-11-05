import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { ContrabandEvent, ContrabandEventKind } from '../classes/rules/contraband-game-state';
import { CallKind, ContrabandVariant } from '../classes/rules/contraband-rules';
import { CustomsOutcome } from '../classes/rules/customs';

/** A trunk settled */
export type SettledEvent = Extract<ContrabandEvent, { kind: ContrabandEventKind.SETTLED }>;
/** A game of the match over: its trunk settled, or never packed */
export type CrossingEvent = (ContrabandEvent & { readonly kind: ContrabandEventKind.PACK_LATE }) | SettledEvent;

/** The sign of an amount, a select of its texts: they write the amount without it */
export enum Sign {
    PLUS = 'plus',
    MINUS = 'minus',
    ZERO = 'zero',
}

const key = (text: string): string => scopedKey(TranslationScope.CONTRABAND, text);

/**
 * An amount of millions as the texts read it: its sign apart, the amount without it. The amounts come rounded: halves,
 * or the balances of the standings, rounded to the hundredth
 */
export function signed(amount: number): Readonly<{ sign: Sign; amount: number }> {
    if (amount === 0) {
        return { sign: Sign.ZERO, amount: 0 };
    }
    return amount > 0 ? { sign: Sign.PLUS, amount } : { sign: Sign.MINUS, amount: -amount };
}

/** A line of the history of the match: a game over, its players named, what its trunk held and the money it moved */
export function eventText(event: Readonly<CrossingEvent>, names: ReadonlyArray<string>): TranslatableText {
    const params = { number: event.crossing + 1, smuggler: names[event.smuggler], inspector: names[event.inspector] };

    if (event.kind === ContrabandEventKind.PACK_LATE) {
        return { key: key(marker('table.move.packLate', undefined, 'contraband')), params };
    }

    const { outcome, smuggled, seized, indemnity } = event.movement;
    const doubt: number = event.call.kind === CallKind.DOUBT ? event.call.amount : 0;
    switch (outcome) {
        case CustomsOutcome.PASSED:
            // An inspector late passes: the history does not tell it as its choice
            return event.lateCall
                ? { key: key(marker('table.move.passedLate', undefined, 'contraband')), params: { ...params, amount: smuggled } }
                : { key: key(marker('table.move.passed', undefined, 'contraband')), params: { ...params, amount: smuggled } };
        case CustomsOutcome.EMPTY_DOUBT:
            return { key: key(marker('table.move.emptyDoubt', undefined, 'contraband')), params: { ...params, doubt, indemnity } };
        case CustomsOutcome.SEIZED:
            return { key: key(marker('table.move.seized', undefined, 'contraband')), params: { ...params, call: event.call.kind, doubt, amount: seized } };
        case CustomsOutcome.SLIPPED:
            return { key: key(marker('table.move.slipped', undefined, 'contraband')), params: { ...params, doubt, amount: smuggled, indemnity } };
        case CustomsOutcome.IRON_CHECKED:
            return { key: key(marker('table.move.ironChecked', undefined, 'contraband')), params: { ...params, indemnity } };
        case CustomsOutcome.WITHHELD:
            return { key: key(marker('table.move.withheld', undefined, 'contraband')), params: { ...params, reason: event.reason, amount: seized } };
    }
}

/** What a trunk settled held: an amount, an empty trunk or a bar, or a trunk not revealed */
export function trunkText(event: Readonly<SettledEvent>, variant: ContrabandVariant): TranslatableText {
    const contents: number | null = event.contents;

    if (contents === null) {
        return { key: key(marker('table.trunk.withheld', undefined, 'contraband')) };
    }
    if (variant === ContrabandVariant.GOLD_RUSH) {
        return contents > 0 ? { key: key(marker('table.trunk.gold', undefined, 'contraband')) } : { key: key(marker('table.trunk.iron', undefined, 'contraband')) };
    }
    return contents > 0
        ? { key: key(marker('table.trunk.amount', undefined, 'contraband')), params: { amount: contents } }
        : { key: key(marker('table.trunk.empty', undefined, 'contraband')) };
}

/** The seconds left, in minutes and seconds */
export function clockText(seconds: number): TranslatableText {
    return { key: key(marker('table.clock', undefined, 'contraband')), params: { minutes: Math.floor(seconds / 60), seconds: String(seconds % 60).padStart(2, '0') } };
}
