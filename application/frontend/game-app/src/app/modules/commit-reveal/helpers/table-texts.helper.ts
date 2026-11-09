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
