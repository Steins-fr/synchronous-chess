/** The values of the chips */
export enum ChipValue {
    ONE = 1,
    FIVE = 5,
    TWENTY_FIVE = 25,
    HUNDRED = 100,
}

/** The values of the chips, from the highest */
export const CHIP_VALUES: ReadonlyArray<ChipValue> = [ChipValue.HUNDRED, ChipValue.TWENTY_FIVE, ChipValue.FIVE, ChipValue.ONE];

/** The fewest chips making an amount, from the highest value */
export function chipsOf(amount: number): ReadonlyArray<ChipValue> {
    let left: number = Math.max(0, Math.floor(amount));

    return CHIP_VALUES.flatMap((value: ChipValue) => {
        const count: number = Math.floor(left / value);
        left -= count * value;
        return Array.from({ length: count }, () => value);
    });
}
