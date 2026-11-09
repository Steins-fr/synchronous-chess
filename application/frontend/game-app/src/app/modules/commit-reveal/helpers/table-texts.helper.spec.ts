import { translated } from '@testing/translatable-text.helper';
import { clockText, setupTimeOf, setupTimeOptions, Sign, signed, TimeUnit } from './table-texts.helper';
import { describe, expect, test } from 'vitest';

describe('signed', () => {
    test.each([[300, Sign.PLUS, 300], [-12.5, Sign.MINUS, 12.5], [0, Sign.ZERO, 0], [-33.33, Sign.MINUS, 33.33]])(
        'should part %d into its sign and its amount', (value: number, sign: Sign, amount: number) => {
            expect(signed(value)).toEqual({ sign, amount });
        });
});

describe('clockText', () => {
    test.each([[300, '5:00'], [65, '1:05'], [4, '0:04']])('should tell %i seconds in minutes and seconds', (seconds: number, text: string) => {
        expect(translated(clockText(seconds))).toEqual(text);
    });
});

describe('setupTimeOf', () => {
    test.each([[30, TimeUnit.SECONDS, 30], [120, TimeUnit.MINUTES, 2]])('should show %i seconds in its unit', (seconds: number, unit: TimeUnit, count: number) => {
        expect(setupTimeOf(seconds)).toEqual({ unit, count });
    });
});

describe('setupTimeOptions', () => {
    test('should offer each time in seconds under a minute, else in minutes', () => {
        // When
        const options = setupTimeOptions([30, 60, 300]);

        // Then
        expect(options.map((option) => [option.value, translated(option.label)])).toEqual([['30', '30 s'], ['60', '1 min'], ['300', '5 min']]);
    });
});
