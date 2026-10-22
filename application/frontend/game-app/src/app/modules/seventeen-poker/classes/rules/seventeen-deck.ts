import { CardRank, CardSuit, JOKER, PlayingCard } from '@app/modules/playing-cards/types/playing-card';

/**
 * The 17 cards of the Seventeen Poker: the aces, kings, queens and jacks of the four suits, then the joker. A mental deck
 * of the game deals the positions of this list: the card of a position is the card at its index
 */
export const SEVENTEEN_DECK: ReadonlyArray<PlayingCard> = [
    ...Object.values(CardSuit).flatMap((suit: CardSuit): PlayingCard[] => Object.values(CardRank).map((rank: CardRank): PlayingCard => ({ rank, suit }))),
    JOKER,
];

/** The card of a position of the deck */
export function seventeenCard(position: number): PlayingCard {
    const card: PlayingCard | undefined = SEVENTEEN_DECK[position];

    if (card === undefined) {
        throw new Error(`The deck has no position ${ position }`);
    }

    return card;
}
