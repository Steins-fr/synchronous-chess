import { BID_POKER_RULES, BidPokerRules } from './bid-poker-rules';
import { drawCatalogue, lotCompositions, lotLetter } from './catalogue';
import { describe, expect, test } from 'vitest';

describe('catalogue', () => {
    test('should name the lots by letters', () => {
        expect([0, 1, 9].map((index: number) => lotLetter(index))).toEqual(['A', 'B', 'J']);
    });

    test.each([
        { total: 52, sizes: [5, 6], compositions: [[5, 5, 6, 6, 6, 6, 6, 6, 6], [5, 5, 5, 5, 5, 5, 5, 5, 6, 6]] },
        { total: 15, sizes: [5], compositions: [[5, 5, 5]] },
        { total: 7, sizes: [5, 6], compositions: [] },
    ])('should split $total cards into lots of $sizes', ({ total, sizes, compositions }) => {
        expect(lotCompositions(total, sizes)).toEqual(compositions);
    });

    // The values come from another implementation of the same draws: every page must draw the same lots
    test('should cut the deck shuffled by the seed into lots of 5 or 6 cards, every card once', async () => {
        // When
        const lots: ReadonlyArray<ReadonlyArray<number>> = await drawCatalogue('seed', BID_POKER_RULES);

        // Then
        expect(lots.map((lot: ReadonlyArray<number>) => lot.length)).toEqual([6, 6, 6, 5, 5, 6, 6, 6, 6]);
        expect(lots[0]).toEqual([2, 16, 6, 18, 13, 7]);
        expect(lots.at(-1)).toEqual([51, 19, 15, 9, 14, 40]);
        expect([...lots.flat()].sort((one: number, other: number) => one - other)).toEqual(Array.from({ length: 52 }, (_, id: number) => id));
    });

    test('should cut a smaller deck', async () => {
        // Given
        const rules: BidPokerRules = { ...BID_POKER_RULES, deck: BID_POKER_RULES.deck.slice(0, 15), lotSizes: [5] };

        // Then
        await expect(drawCatalogue('seed', rules)).resolves.toEqual([[2, 11, 13, 6, 12], [0, 1, 7, 10, 5], [4, 14, 3, 9, 8]]);
    });

    test('should refuse lots that can not make the deck', async () => {
        // Given
        const rules: BidPokerRules = { ...BID_POKER_RULES, deck: BID_POKER_RULES.deck.slice(0, 7) };

        // Then
        await expect(drawCatalogue('seed', rules)).rejects.toThrow('No lots of 5 or 6 cards make a deck of 7');
    });
});
