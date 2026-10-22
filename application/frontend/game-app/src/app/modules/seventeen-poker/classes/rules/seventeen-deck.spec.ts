import { CardRank, CardSuit, JOKER, PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { SEVENTEEN_DECK, seventeenCard } from './seventeen-deck';
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

    test('should give the card of a position', () => {
        // Then
        expect(seventeenCard(0)).toEqual({ rank: CardRank.JACK, suit: CardSuit.SPADES });
        expect(seventeenCard(16)).toEqual(JOKER);
    });

    test.each([-1, 17, 1.5])('should refuse the position %s, out of the deck', (position: number) => {
        // Then
        expect(() => seventeenCard(position)).toThrow(`The deck has no position ${ position }`);
    });
});
