import { CardRank, CardSuit, JOKER, PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { evaluateHand, HandCategory } from '@app/modules/playing-cards/helpers/hand-evaluator.helper';
import { SEVENTEEN_DECK, SEVENTEEN_RANKS, seventeenCard } from './seventeen-deck';
import { describe, expect, test } from 'vitest';

describe('SeventeenDeck', () => {
    test('should hold the aces, kings, queens and jacks of each suit, then the joker', () => {
        // Then
        expect(SEVENTEEN_DECK).toHaveLength(17);
        expect(new Set(SEVENTEEN_DECK.map((card: PlayingCard) => JSON.stringify(card))).size).toEqual(17);
        expect(SEVENTEEN_DECK.filter((card: PlayingCard) => card !== JOKER && card.rank === CardRank.ACE)).toHaveLength(4);
        expect(SEVENTEEN_DECK.filter((card: PlayingCard) => card !== JOKER && card.suit === CardSuit.HEARTS)).toHaveLength(4);
        expect(SEVENTEEN_DECK.at(-1)).toEqual(JOKER);
    });

    test('should hold the jacks to the aces only', () => {
        // Then
        expect(SEVENTEEN_RANKS).toEqual([CardRank.JACK, CardRank.QUEEN, CardRank.KING, CardRank.ACE]);
        expect(SEVENTEEN_DECK.every((card: PlayingCard) => card === JOKER || SEVENTEEN_RANKS.includes(card.rank))).toBe(true);
    });

    test('should give the card of a position', () => {
        // Then
        expect(seventeenCard(0)).toEqual({ rank: CardRank.JACK, suit: CardSuit.SPADES });
        expect(seventeenCard(16)).toEqual(JOKER);
    });

    test.each([-1, 17, 1.5])('should refuse the position %s, out of the deck', (position: number) => {
        // Then
        expect(() => seventeenCard(position)).toThrow(`The deck has no position ${ position }`);
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
});
