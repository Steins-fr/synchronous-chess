import { describe, expect, test } from 'vitest';
import { HandCategory, HandValue } from '../classes/rules/hand-evaluator';
import { HandEnd } from '../classes/rules/poker-match';
import { PokerSeat } from '../classes/rules/poker-seat';
import { handOutcomeText } from './hand-outcome-text.helper';

const value = (category: HandCategory): HandValue => ({ category, ranks: [], joker: false });

describe('handOutcomeText', () => {
    const seats: [string, string] = ['alice', 'bob'];

    test('should tell a no contest', () => {
        expect(handOutcomeText({ end: HandEnd.NO_CONTEST, winner: null, pot: 10, gains: [0, 0], hands: null }, 0, seats))
            .toEqual({ key: 'poker.table.outcome.noContest', params: { index: 1, pot: 10, winner: null } });
    });

    test('should tell who folded', () => {
        expect(handOutcomeText({ end: HandEnd.FOLD, winner: PokerSeat.TWO, pot: 12, gains: [0, 12], hands: null }, 3, seats))
            .toEqual({ key: 'poker.table.outcome.fold', params: { index: 4, pot: 12, winner: 'bob', folder: 'alice' } });
    });

    test('should tell the hand winning the showdown', () => {
        const hands: [HandValue, HandValue] = [value(HandCategory.ONE_PAIR), value(HandCategory.FULL_HOUSE)];
        expect(handOutcomeText({ end: HandEnd.SHOWDOWN, winner: PokerSeat.TWO, pot: 30, gains: [0, 30], hands }, 1, seats))
            .toEqual({ key: 'poker.table.outcome.win', params: { index: 2, pot: 30, winner: 'bob', category: HandCategory.FULL_HOUSE } });
    });

    test('should tell the equal hands splitting the pot', () => {
        const hands: [HandValue, HandValue] = [value(HandCategory.TWO_PAIR), value(HandCategory.TWO_PAIR)];
        expect(handOutcomeText({ end: HandEnd.SHOWDOWN, winner: null, pot: 30, gains: [15, 15], hands }, 1, seats))
            .toEqual({ key: 'poker.table.outcome.split', params: { index: 2, pot: 30, winner: null, category: HandCategory.TWO_PAIR } });
    });
});
