import { CardRank, CardSuit, JOKER, PlayingCard } from '@app/modules/playing-cards/types/playing-card';

const RANKS: Readonly<Record<string, CardRank>> = {
    2: CardRank.TWO, 3: CardRank.THREE, 4: CardRank.FOUR, 5: CardRank.FIVE, 6: CardRank.SIX, 7: CardRank.SEVEN, 8: CardRank.EIGHT, 9: CardRank.NINE,
    T: CardRank.TEN, J: CardRank.JACK, Q: CardRank.QUEEN, K: CardRank.KING, A: CardRank.ACE,
};
const SUITS: Readonly<Record<string, CardSuit>> = { S: CardSuit.SPADES, H: CardSuit.HEARTS, D: CardSuit.DIAMONDS, C: CardSuit.CLUBS };

/** The cards of a text: a rank (2 to 9, T, J, Q, K, A) then a suit (S, H, D, C) for each card, `*` for the joker, `'AS TH *'` */
export function cards(text: string): PlayingCard[] {
    return text.split(' ').map((card: string): PlayingCard => card === '*' ? JOKER : { rank: RANKS[card[0]], suit: SUITS[card[1]] });
}
