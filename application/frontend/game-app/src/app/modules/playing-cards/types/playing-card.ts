/** The ranks of the cards the games use, from the lowest */
export enum CardRank {
    JACK = 'jack',
    QUEEN = 'queen',
    KING = 'king',
    ACE = 'ace',
}

export enum CardSuit {
    SPADES = 'spades',
    HEARTS = 'hearts',
    DIAMONDS = 'diamonds',
    CLUBS = 'clubs',
}

export const JOKER = 'joker';
export type Joker = typeof JOKER;

export interface SuitedCard {
    readonly rank: CardRank;
    readonly suit: CardSuit;
}

/** A card of a deck: a rank of a suit, or the joker */
export type PlayingCard = SuitedCard | Joker;
