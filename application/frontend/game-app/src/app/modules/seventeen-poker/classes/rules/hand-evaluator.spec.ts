import { CardRank, PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { cards } from '@testing/playing-cards.helper';
import { compareHands, evaluateHand, HandCategory, HandValue } from './hand-evaluator';
import { SEVENTEEN_DECK } from './seventeen-deck';
import { describe, expect, test } from 'vitest';

const { ACE, KING, QUEEN, JACK } = CardRank;

describe('HandEvaluator', () => {
    test.each<{ hand: string; category: HandCategory; ranks: CardRank[] }>([
        { hand: 'KS KH KD KC AS', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, ACE] },
        { hand: 'KS KH KD QC QS', category: HandCategory.FULL_HOUSE, ranks: [KING, QUEEN] },
        { hand: 'KS KH KD QC AS', category: HandCategory.THREE_OF_A_KIND, ranks: [KING, ACE, QUEEN] },
        { hand: 'JS JH QD QC AS', category: HandCategory.TWO_PAIR, ranks: [QUEEN, JACK, ACE] },
        { hand: 'KS KH QD AC JS', category: HandCategory.ONE_PAIR, ranks: [KING, ACE, QUEEN, JACK] },
    ])('should find a natural $category in $hand', ({ hand, category, ranks }) => {
        // When
        const value: HandValue = evaluateHand(cards(hand));

        // Then
        expect(value).toEqual({ category, ranks, joker: false });
    });

    test.each<{ hand: string; category: HandCategory; ranks: CardRank[] }>([
        { hand: 'AS AH AD AC *', category: HandCategory.FIVE_OF_A_KIND, ranks: [ACE] },
        { hand: 'JS QS KS AS *', category: HandCategory.ROYAL_FLUSH, ranks: [ACE, KING, QUEEN, JACK] },
        { hand: 'KS KH KD QC *', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, QUEEN] },
        { hand: 'KS KH KD AS *', category: HandCategory.FOUR_OF_A_KIND, ranks: [KING, ACE] },
        { hand: 'QS QH KD KC *', category: HandCategory.FULL_HOUSE, ranks: [KING, QUEEN] },
        { hand: 'JS QH KS AS *', category: HandCategory.STRAIGHT, ranks: [ACE, KING, QUEEN, JACK] },
        { hand: 'KS KH QD AC *', category: HandCategory.THREE_OF_A_KIND, ranks: [KING, ACE, QUEEN] },
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
    ])('should break a tie by $name', ({ better, worse }) => {
        // Then
        expect(compareHands(evaluateHand(cards(better)), evaluateHand(cards(worse)))).toBeGreaterThan(0);
        expect(compareHands(evaluateHand(cards(worse)), evaluateHand(cards(better)))).toBeLessThan(0);
    });

    test.each<{ name: string; first: string; second: string }>([
        { name: 'the same ranks', first: 'KS KH QD QC AS', second: 'KD KC QS QH AH' },
        { name: 'two straights', first: 'JS QH KS AS *', second: 'JH QS KH AD *' },
    ])('should find equal hands of $name', ({ first, second }) => {
        // Then
        expect(compareHands(evaluateHand(cards(first)), evaluateHand(cards(second)))).toEqual(0);
    });

    test('should find a category for every hand the deck deals, a pair at least', () => {
        // Given
        const counts: Map<HandCategory, number> = new Map<HandCategory, number>();
        const deal = (hand: ReadonlyArray<PlayingCard>, from: number): void => {
            if (hand.length === 5) {
                const category: HandCategory = evaluateHand(hand).category;
                counts.set(category, (counts.get(category) ?? 0) + 1);
                return;
            }

            for (let position: number = from; position < SEVENTEEN_DECK.length; position++) {
                deal([...hand, SEVENTEEN_DECK[position]], position + 1);
            }
        };

        // When
        deal([], 0);

        // Then: the 6188 hands of 5 cards out of 17, none without a pair
        expect(Object.fromEntries(counts)).toEqual({
            [HandCategory.FIVE_OF_A_KIND]: 4,
            [HandCategory.ROYAL_FLUSH]: 4,
            [HandCategory.FOUR_OF_A_KIND]: 240,
            [HandCategory.FULL_HOUSE]: 504,
            [HandCategory.STRAIGHT]: 252,
            [HandCategory.THREE_OF_A_KIND]: 1920,
            [HandCategory.TWO_PAIR]: 1728,
            [HandCategory.ONE_PAIR]: 1536,
        });
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
