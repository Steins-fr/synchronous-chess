/** The ranks of the cards, from the lowest: the order of the values is the order of the ranks */
export enum CardRank {
    TWO = 'two',
    THREE = 'three',
    FOUR = 'four',
    FIVE = 'five',
    SIX = 'six',
    SEVEN = 'seven',
    EIGHT = 'eight',
    NINE = 'nine',
    TEN = 'ten',
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

/** The 52 cards, each rank of each suit, from the two of spades */
export const FULL_DECK: ReadonlyArray<Readonly<SuitedCard>> = Object.values(CardSuit)
    .flatMap((suit: CardSuit): SuitedCard[] => Object.values(CardRank).map((rank: CardRank): SuitedCard => ({ rank, suit })));
