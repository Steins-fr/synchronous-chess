import { describe, expect, test } from 'vitest';
import { ChipValue, chipsOf } from './chip';

const { ONE, FIVE, TWENTY_FIVE, HUNDRED } = ChipValue;

describe('chipsOf', () => {
    test.each<{ amount: number; chips: ChipValue[] }>([
        { amount: 0, chips: [] },
        { amount: 1, chips: [ONE] },
        { amount: 11, chips: [FIVE, FIVE, ONE] },
        { amount: 150, chips: [HUNDRED, TWENTY_FIVE, TWENTY_FIVE] },
        { amount: 139, chips: [HUNDRED, TWENTY_FIVE, FIVE, FIVE, ONE, ONE, ONE, ONE] },
        { amount: -3, chips: [] },
    ])('should make $amount with the fewest chips', ({ amount, chips }) => {
        expect(chipsOf(amount)).toEqual(chips);
    });
});
