import { describe, expect, test } from 'vitest';
import { otherSeat, SeatPair, TableSeat, toSeatPair, withSeat } from './seat-pair.helper';

describe('seat pair helper', () => {
    test('should give the other seat', () => {
        expect(otherSeat(TableSeat.ONE)).toEqual(TableSeat.TWO);
        expect(otherSeat(TableSeat.TWO)).toEqual(TableSeat.ONE);
    });

    test('should change the value of a seat only', () => {
        // Given
        const pair: SeatPair<string> = ['a', 'b'];

        // Then
        expect(withSeat(pair, TableSeat.ONE, 'c')).toEqual(['c', 'b']);
        expect(withSeat(pair, TableSeat.TWO, 'c')).toEqual(['a', 'c']);
        expect(pair).toEqual(['a', 'b']);
    });

    test('should give the values of a table of two seats as a pair', () => {
        expect(toSeatPair(['a', null])).toEqual(['a', null]);
    });
});
