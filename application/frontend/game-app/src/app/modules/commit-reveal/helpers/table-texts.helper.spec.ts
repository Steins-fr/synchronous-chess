import { Sign, signed } from './table-texts.helper';
import { describe, expect, test } from 'vitest';

describe('signed', () => {
    test.each([[300, Sign.PLUS, 300], [-12.5, Sign.MINUS, 12.5], [0, Sign.ZERO, 0], [-33.33, Sign.MINUS, 33.33]])(
        'should part %d into its sign and its amount', (value: number, sign: Sign, amount: number) => {
            expect(signed(value)).toEqual({ sign, amount });
        });
});
