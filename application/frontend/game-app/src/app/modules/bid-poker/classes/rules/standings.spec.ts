import { FULL_DECK, SuitedCard } from '@app/modules/playing-cards/types/playing-card';
import { HandCategory } from '@app/modules/playing-cards/helpers/hand-evaluator.helper';
import { suitedCards } from '@testing/playing-cards.helper';
import { BID_POKER_RULES } from './bid-poker-rules';
import { BidPokerResult, settle, Standing } from './standings';
import { describe, expect, test } from 'vitest';

/** The ids of the cards of a text in the deck of the game */
const ids = (text: string): number[] => text === '' ? [] : suitedCards(text)
    .map((card: SuitedCard) => FULL_DECK.findIndex(({ rank, suit }) => rank === card.rank && suit === card.suit));

const ROYAL = 'TS JS QS KS AS';
const FOUR = '9H 9D 9C 9S 2H';
const FLUSH = '2D 5D 7D JD KD';
const PAIR = '3C 3H 6C 8H TC';
const HIGH = '4C 7S 9D JC KH';

function standings(hands: ReadonlyArray<string>, coins: ReadonlyArray<number> = hands.map(() => 300)): BidPokerResult {
    return settle(hands.map(ids), coins, BID_POKER_RULES);
}

const summary = (standing: Standing): [number | null, boolean, number, number, number] =>
    [standing.place, standing.pig, standing.prize, standing.fine, standing.balance];

describe('settle', () => {
    test('should make the worst hand the pig when every player has one, the prizes multiplied by 1', () => {
        // When
        const result: BidPokerResult = standings([HIGH, ROYAL, FLUSH, PAIR]);

        // Then
        expect(result.standings.map(summary)).toEqual([
            [null, true, 0, 150, 50],
            [1, false, 100, 0, 300],
            [2, false, 40, 0, 240],
            [3, false, 10, 0, 210],
        ]);
        expect([result.pigs, result.unpaid]).toEqual([1, 0]);
        expect(result.standings[1].best?.value.category).toEqual(HandCategory.ROYAL_FLUSH);
    });

    test('should make pigs of every player under 5 cards, the prizes multiplied by their number', () => {
        // When
        const result: BidPokerResult = standings([HIGH, '2C 3C', ROYAL, '', PAIR], [300, 400, 100, 300, 250]);

        // Then
        expect(result.standings.map(summary)).toEqual([
            [3, false, 20, 0, 220],
            [null, true, 0, 150, 150],
            [1, false, 200, 0, 200],
            [null, true, 0, 150, 50],
            [2, false, 80, 0, 230],
        ]);
        expect(result.standings[1].best).toBeNull();
        expect([result.pigs, result.unpaid]).toEqual([2, 0]);
    });

    test('should make pigs of the equal worst hands', () => {
        // When
        const result: BidPokerResult = standings([HIGH, ROYAL, '4D 7H 9S JD KC', FLUSH]);

        // Then the third prize has no player: it goes to the bank
        expect(result.standings.map(summary)).toEqual([
            [null, true, 0, 150, 50],
            [1, false, 200, 0, 400],
            [null, true, 0, 150, 50],
            [2, false, 80, 0, 280],
        ]);
        expect(result.unpaid).toEqual(20);
    });

    test('should share the prizes of the places equal hands cover, in whole coins', () => {
        // When the 2nd to the 4th share 40 + 10
        const result: BidPokerResult = standings([ROYAL, FLUSH, '2H 5H 7H JH KH', '2S 5S 7S JS KS', HIGH]);

        // Then
        expect(result.standings.map(summary)).toEqual([
            [1, false, 100, 0, 300],
            [2, false, 16, 0, 216],
            [2, false, 16, 0, 216],
            [2, false, 16, 0, 216],
            [null, true, 0, 150, 50],
        ]);
        expect(result.unpaid).toEqual(2);
    });

    test('should make pigs of every player when every hand is equal', () => {
        // When
        const result: BidPokerResult = standings([FLUSH, '2H 5H 7H JH KH', '2S 5S 7S JS KS', '2C 5C 7C JC KC']);

        // Then the fines go to the bank
        expect(result.standings.every((standing: Standing) => standing.pig)).toBe(true);
        expect([result.pigs, result.unpaid]).toEqual([4, 600]);
    });

    test('should play the best 5 cards of more', () => {
        // When
        const result: BidPokerResult = standings([`${ FOUR } 3D 4H`, ROYAL, PAIR, HIGH]);

        // Then
        expect(result.standings[0].best?.value.category).toEqual(HandCategory.FOUR_OF_A_KIND);
        expect(result.standings.map((standing: Standing) => standing.place)).toEqual([2, 1, 3, null]);
    });
});
