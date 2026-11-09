import { ChoiceOption } from '@app/modules/form/choice-field/choice-field.component';
import { TranslatableText } from '@app/types/translatable-text.type';
import { marker } from '@jsverse/transloco-keys-manager/marker';

export const SECONDS_PER_MINUTE: number = 60;

/** The sign of an amount, a select of its texts: they write the amount without it */
export enum Sign {
    PLUS = 'plus',
    MINUS = 'minus',
    ZERO = 'zero',
}

/** An amount of millions as a text reads it: its sign apart, the amount without it */
export interface SignedAmount {
    readonly sign: Sign;
    readonly amount: number;
}

/** An amount of millions as the texts read it: its sign apart, the amount without it. The amounts come rounded */
export function signed(amount: number): Readonly<SignedAmount> {
    if (amount === 0) {
        return { sign: Sign.ZERO, amount: 0 };
    }
    return amount > 0 ? { sign: Sign.PLUS, amount } : { sign: Sign.MINUS, amount: -amount };
}

/** The seconds left, in minutes and seconds */
export function clockText(seconds: number): TranslatableText {
    return {
        key: marker('rooms.table.clock'),
        params: { minutes: Math.floor(seconds / SECONDS_PER_MINUTE), seconds: String(seconds % SECONDS_PER_MINUTE).padStart(2, '0') },
    };
}

/** The unit a time of the setup shows in, a select of its texts */
export enum TimeUnit {
    SECONDS = 'seconds',
    MINUTES = 'minutes',
}

/** A time of the setup as it shows: in seconds under a minute, else in minutes */
export function setupTimeOf(seconds: number): Readonly<{ unit: TimeUnit; count: number }> {
    return seconds < SECONDS_PER_MINUTE ? { unit: TimeUnit.SECONDS, count: seconds } : { unit: TimeUnit.MINUTES, count: seconds / SECONDS_PER_MINUTE };
}

/** The times the setup of a game offers, in seconds, as its choices */
export function setupTimeOptions(times: ReadonlyArray<number>): ReadonlyArray<Readonly<ChoiceOption>> {
    return times.map((seconds: number): ChoiceOption => {
        const { unit, count } = setupTimeOf(seconds);
        return {
            value: String(seconds),
            label: unit === TimeUnit.SECONDS ? { key: marker('rooms.table.seconds'), params: { count } } : { key: marker('rooms.table.minutes'), params: { count } },
        };
    });
}
