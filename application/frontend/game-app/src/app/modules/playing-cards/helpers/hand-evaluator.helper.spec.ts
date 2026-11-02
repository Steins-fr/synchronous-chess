import { CardRank } from '@app/modules/playing-cards/types/playing-card';
import { cards } from '@testing/playing-cards.helper';
import { compareHands, evaluateHand, HandCategory, HandValue } from './hand-evaluator.helper';
import { describe, expect, test } from 'vitest';

const { ACE, KING, QUEEN, JACK, TEN, NINE, SEVEN, FIVE, FOUR, THREE, TWO } = CardRank;

describe('HandEvaluator', () => {
    test.each<{ hand: string; category: HandCategory; ranks: CardRank[] }>([
        { hand: 'KS KH KD KC AS', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, ACE] },
        { hand: 'KS KH KD QC QS', category: HandCategory.FULL_HOUSE, ranks: [KING, QUEEN] },
        { hand: 'KS KH KD QC AS', category: HandCategory.THREE_OF_A_KIND, ranks: [KING, ACE, QUEEN] },
        { hand: 'JS JH QD QC AS', category: HandCategory.TWO_PAIR, ranks: [QUEEN, JACK, ACE] },
        { hand: 'KS KH QD AC JS', category: HandCategory.ONE_PAIR, ranks: [KING, ACE, QUEEN, JACK] },
        { hand: 'AS KH 9D 5C 3S', category: HandCategory.HIGH_CARD, ranks: [ACE, KING, NINE, FIVE, THREE] },
        { hand: '2H 7H 9H JH KH', category: HandCategory.FLUSH, ranks: [KING, JACK, NINE, SEVEN, TWO] },
        { hand: '5S 6H 7D 8C 9S', category: HandCategory.STRAIGHT, ranks: [NINE, CardRank.EIGHT, SEVEN, CardRank.SIX, FIVE] },
        { hand: 'AS 2H 3D 4C 5S', category: HandCategory.STRAIGHT, ranks: [FIVE, FOUR, THREE, TWO, ACE] },
        { hand: '5H 6H 7H 8H 9H', category: HandCategory.STRAIGHT_FLUSH, ranks: [NINE, CardRank.EIGHT, SEVEN, CardRank.SIX, FIVE] },
        { hand: 'AH 2H 3H 4H 5H', category: HandCategory.STRAIGHT_FLUSH, ranks: [FIVE, FOUR, THREE, TWO, ACE] },
        { hand: 'TS JS QS KS AS', category: HandCategory.ROYAL_FLUSH, ranks: [ACE, KING, QUEEN, JACK, TEN] },
        { hand: 'TS JH QD KC AS', category: HandCategory.STRAIGHT, ranks: [ACE, KING, QUEEN, JACK, TEN] },
        { hand: 'KS AH 2D 3C 4S', category: HandCategory.HIGH_CARD, ranks: [ACE, KING, FOUR, THREE, TWO] },
        { hand: '2S 2H 9D 9C 9S', category: HandCategory.FULL_HOUSE, ranks: [NINE, TWO] },
    ])('should find a natural $category in $hand', ({ hand, category, ranks }) => {
        // When
        const value: HandValue = evaluateHand(cards(hand));

        // Then
        expect(value).toEqual({ category, ranks, joker: false });
    });

    test.each<{ hand: string; category: HandCategory; ranks: CardRank[] }>([
        { hand: 'AS AH AD AC *', category: HandCategory.FIVE_OF_A_KIND, ranks: [ACE] },
        { hand: 'JS QS KS AS *', category: HandCategory.ROYAL_FLUSH, ranks: [ACE, KING, QUEEN, JACK, TEN] },
        { hand: 'KS KH KD QC *', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, QUEEN] },
        { hand: 'KS KH KD AS *', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, ACE] },
        { hand: 'QS QH KD KC *', category: HandCategory.FULL_HOUSE, ranks: [KING, QUEEN] },
        { hand: 'JS QH KS AS *', category: HandCategory.STRAIGHT, ranks: [ACE, KING, QUEEN, JACK, TEN] },
        { hand: 'KS KH QD AC *', category: HandCategory.THREE_OF_A_KIND, ranks: [KING, ACE, QUEEN] },
        { hand: '5S 6H 7D 8C *', category: HandCategory.STRAIGHT, ranks: [NINE, CardRank.EIGHT, SEVEN, CardRank.SIX, FIVE] },
        { hand: 'AS 2H 3D 4C *', category: HandCategory.STRAIGHT, ranks: [FIVE, FOUR, THREE, TWO, ACE] },
        { hand: 'AH KH 9H 7H *', category: HandCategory.FLUSH, ranks: [ACE, KING, QUEEN, NINE, SEVEN] },
        { hand: '9H 8H 6H 5H *', category: HandCategory.STRAIGHT_FLUSH, ranks: [NINE, CardRank.EIGHT, SEVEN, CardRank.SIX, FIVE] },
        { hand: 'AS 9H 7D 4C *', category: HandCategory.ONE_PAIR, ranks: [ACE, NINE, SEVEN, FOUR] },
    ])('should find a $category in $hand, the joker giving the best hand', ({ hand, category, ranks }) => {
        // When
        const value: HandValue = evaluateHand(cards(hand));

        // Then
        expect(value).toEqual({ category, ranks, joker: true });
    });

    test.each<{ better: string; worse: string }>([
        { better: 'JS JH JD JC *', worse: 'JS QS KS AS *' },
        { better: 'JS QS KS AS *', worse: 'AS AH AD AC KS' },
        { better: 'JS JH JD JC QS', worse: 'AS AH AD KC KS' },
        { better: 'JS JH JD QC QS', worse: 'JS QH KS AS *' },
        { better: 'JS QH KS AS *', worse: 'AS AH AD KC QS' },
        { better: 'JS JH JD QC KS', worse: 'AS AH KD KC QS' },
        { better: 'JS JH QD QC KS', worse: 'AS AH KD QC JS' },
        { better: '5H 6H 7H 8H 9H', worse: 'AS AH AD AC KS' },
        { better: '2S 2H 3D 3C 3S', worse: '2H 7H 9H JH KH' },
        { better: '2H 7H 9H JH KH', worse: 'TS JH QD KC AS' },
        { better: 'TS JS QS KS AS', worse: '9S TS JS QS KS' },
        { better: '2S 2H 4D 5C 6S', worse: 'AS KH 9D 5C 3S' },
    ])('should rank $better above $worse, a better category', ({ better, worse }) => {
        // Then
        expect(compareHands(evaluateHand(cards(better)), evaluateHand(cards(worse)))).toBeGreaterThan(0);
        expect(compareHands(evaluateHand(cards(worse)), evaluateHand(cards(better)))).toBeLessThan(0);
    });

    test.each<{ name: string; better: string; worse: string }>([
        { name: 'the rank of the four of a kind', better: 'AS AH AD AC JS', worse: 'KS KH KD KC AS' },
        { name: 'the three of a kind of the full house', better: 'KS KH KD JC JS', worse: 'QS QH QD AC AS' },
        { name: 'the pair of the full house', better: 'KS KH KD AC AS', worse: 'KS KH KD QC QS' },
        { name: 'the highest pair', better: 'AS AH JD JC QS', worse: 'KS KH QD QC AS' },
        { name: 'the last card', better: 'KS KH QD QC AS', worse: 'KD KC QS QH JS' },
        { name: 'a natural hand above the same with the joker', better: 'AS AH AD QC QS', worse: 'QD QH AC AD *' },
        { name: 'a natural three of a kind above one with the joker', better: 'KS KH KD AC QS', worse: 'KC KH AD QD *' },
        { name: 'the highest card of a straight, the wheel the lowest', better: '2S 3H 4D 5C 6S', worse: 'AS 2H 3D 4C 5S' },
        { name: 'the last card of a high card', better: 'AS KH 9D 5C 3S', worse: 'AD KC 9S 5H 2S' },
        { name: 'the last card of a flush', better: '3H 7H 9H JH KH', worse: '2S 7S 9S JS KS' },
    ])('should break a tie by $name', ({ better, worse }) => {
        // Then
        expect(compareHands(evaluateHand(cards(better)), evaluateHand(cards(worse)))).toBeGreaterThan(0);
        expect(compareHands(evaluateHand(cards(worse)), evaluateHand(cards(better)))).toBeLessThan(0);
    });

    test.each<{ name: string; first: string; second: string }>([
        { name: 'the same ranks', first: 'KS KH QD QC AS', second: 'KD KC QS QH AH' },
        { name: 'two straights', first: 'JS QH KS AS *', second: 'JH QS KH AD *' },
        { name: 'two wheels', first: 'AS 2H 3D 4C 5S', second: 'AH 2S 3C 4D 5H' },
    ])('should find equal hands of $name', ({ first, second }) => {
        // Then
        expect(compareHands(evaluateHand(cards(first)), evaluateHand(cards(second)))).toEqual(0);
    });

    test.each(['KS KH QD AC', 'KS KH QD AC JS JH'])('should refuse a hand of other than 5 cards, %s', (hand: string) => {
        // Then
        expect(() => evaluateHand(cards(hand))).toThrow(`A hand holds 5 cards, not ${ hand.split(' ').length }`);
    });

    test('should refuse a hand of two jokers', () => {
        // Then
        expect(() => evaluateHand(cards('KS KH QD * *'))).toThrow('A hand holds a single joker');
    });
});
