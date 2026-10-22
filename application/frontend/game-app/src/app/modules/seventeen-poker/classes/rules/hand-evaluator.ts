import { CardRank, CardSuit, JOKER, PlayingCard, SuitedCard } from '@app/modules/playing-cards/types/playing-card';

/** The hands of the Seventeen Poker, from the lowest. With its 17 cards, every hand holds a pair at least */
export enum HandCategory {
    ONE_PAIR = 'onePair',
    TWO_PAIR = 'twoPair',
    THREE_OF_A_KIND = 'threeOfAKind',
    /** The joker as the ten, and the four ranks of different suits */
    STRAIGHT = 'straight',
    FULL_HOUSE = 'fullHouse',
    FOUR_OF_A_KIND = 'fourOfAKind',
    /** The joker as the ten, and the four ranks of a suit: the only flush the deck can make */
    ROYAL_FLUSH = 'royalFlush',
    FIVE_OF_A_KIND = 'fiveOfAKind',
}

export interface HandValue {
    readonly category: HandCategory;
    /**
     * The rank of each group of cards, from the largest group, the highest rank first: a full house of kings over jacks
     * gives [king, jack]. The ten the joker stands for in a straight is out of the ranks
     */
    readonly ranks: ReadonlyArray<CardRank>;
    /** Whether the hand holds the joker: a natural hand beats the same hand made with the joker */
    readonly joker: boolean;
}

export const HAND_SIZE: number = 5;

const RANKS: ReadonlyArray<CardRank> = Object.values(CardRank);
const CATEGORIES: ReadonlyArray<HandCategory> = Object.values(HandCategory);
/** The value of a rank: the jack follows the ten the joker can stand for */
const TEN: number = 10;
const rankValue = (rank: CardRank): number => TEN + 1 + RANKS.indexOf(rank);

interface Face {
    readonly value: number;
    readonly suit: CardSuit;
}

/** The card the joker can stand for: the ten of a straight, or any card of the deck */
const JOKER_FACES: ReadonlyArray<Face> = Object.values(CardSuit).flatMap((suit: CardSuit): Face[] => [
    { value: TEN, suit },
    ...RANKS.map((rank: CardRank): Face => ({ value: rankValue(rank), suit })),
]);

/** The category of the size of each group of cards, from the largest */
const CATEGORY_OF_GROUPS: Readonly<Record<string, HandCategory>> = {
    '5': HandCategory.FIVE_OF_A_KIND,
    '41': HandCategory.FOUR_OF_A_KIND,
    '32': HandCategory.FULL_HOUSE,
    '311': HandCategory.THREE_OF_A_KIND,
    '221': HandCategory.TWO_PAIR,
    '2111': HandCategory.ONE_PAIR,
    // Five values out of the five the cards have: always the ten to the ace
    '11111': HandCategory.STRAIGHT,
};

function faceValue(faces: ReadonlyArray<Face>, joker: boolean): HandValue {
    const counts: Map<number, number> = new Map<number, number>();
    faces.forEach((face: Face) => counts.set(face.value, (counts.get(face.value) ?? 0) + 1));
    const groups: [number, number][] = [...counts].sort(([valueA, countA]: [number, number], [valueB, countB]: [number, number]): number => countB - countA || valueB - valueA);
    const category: HandCategory = CATEGORY_OF_GROUPS[groups.map(([, count]: [number, number]) => count).join('')];
    const flush: boolean = faces.every((face: Face) => face.suit === faces[0].suit);

    return {
        category: category === HandCategory.STRAIGHT && flush ? HandCategory.ROYAL_FLUSH : category,
        ranks: groups.filter(([value]: [number, number]) => value !== TEN).map(([value]: [number, number]) => RANKS[value - TEN - 1]),
        joker,
    };
}

/** Positive when the first hand beats the second, negative when it loses to it, zero when they are equal */
export function compareHands(a: HandValue, b: HandValue): number {
    const category: number = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);

    if (category !== 0) {
        return category;
    }

    const rankIndex: number = a.ranks.findIndex((rank: CardRank, index: number) => rank !== b.ranks[index]);

    if (rankIndex !== -1) {
        return rankValue(a.ranks[rankIndex]) - rankValue(b.ranks[rankIndex]);
    }

    return Number(b.joker) - Number(a.joker);
}

/** The value of a hand of 5 cards, the joker standing for the card giving the best hand */
export function evaluateHand(cards: ReadonlyArray<PlayingCard>): HandValue {
    if (cards.length !== HAND_SIZE) {
        throw new Error(`A hand holds ${ HAND_SIZE } cards, not ${ cards.length }`);
    }

    const faces: Face[] = cards.filter((card: PlayingCard): card is SuitedCard => card !== JOKER)
        .map((card: SuitedCard): Face => ({ value: rankValue(card.rank), suit: card.suit }));

    if (faces.length === HAND_SIZE) {
        return faceValue(faces, false);
    }

    if (faces.length < HAND_SIZE - 1) {
        throw new Error('A hand holds a single joker');
    }

    const [first, ...others]: HandValue[] = JOKER_FACES.map((jokerFace: Face) => faceValue([...faces, jokerFace], true));

    return others.reduce((best: HandValue, value: HandValue) => compareHands(value, best) > 0 ? value : best, first);
}
