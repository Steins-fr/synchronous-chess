import { CardRank, CardSuit, JOKER, PlayingCard, SuitedCard } from '@app/modules/playing-cards/types/playing-card';

/** The kinds of poker hands, from the lowest */
export enum HandCategory {
    HIGH_CARD = 'highCard',
    ONE_PAIR = 'onePair',
    TWO_PAIR = 'twoPair',
    THREE_OF_A_KIND = 'threeOfAKind',
    /** Five ranks in a row, the ace high or low (the ace to the five) */
    STRAIGHT = 'straight',
    /** Five cards of a suit */
    FLUSH = 'flush',
    FULL_HOUSE = 'fullHouse',
    FOUR_OF_A_KIND = 'fourOfAKind',
    STRAIGHT_FLUSH = 'straightFlush',
    /** The ten to the ace of a suit */
    ROYAL_FLUSH = 'royalFlush',
    /** Five cards of a rank: with the joker only */
    FIVE_OF_A_KIND = 'fiveOfAKind',
}

export interface HandValue {
    readonly category: HandCategory;
    /**
     * The rank of each group of cards, from the largest group, the highest rank first: a full house of kings over jacks
     * gives [king, jack]. A straight from the ace to the five gives its ace last
     */
    readonly ranks: ReadonlyArray<CardRank>;
    /** Whether the hand holds the joker: a natural hand beats the same hand made with the joker */
    readonly joker: boolean;
}

export const HAND_SIZE: number = 5;

const RANKS: ReadonlyArray<CardRank> = Object.values(CardRank);
const CATEGORIES: ReadonlyArray<HandCategory> = Object.values(HandCategory);
/** The value of the lowest rank, the two */
const LOWEST: number = 2;
const ACE: number = LOWEST + RANKS.length - 1;
const rankValue = (rank: CardRank): number => LOWEST + RANKS.indexOf(rank);
const rankOf = (value: number): CardRank => RANKS[value - LOWEST];
/** The values of the straight from the ace to the five, the highest first */
const WHEEL: ReadonlyArray<number> = [ACE, 5, 4, 3, 2];

interface Face {
    readonly value: number;
    readonly suit: CardSuit;
}

/** The cards the joker can stand for: any card of the deck */
const JOKER_FACES: ReadonlyArray<Face> = Object.values(CardSuit)
    .flatMap((suit: CardSuit): Face[] => RANKS.map((rank: CardRank): Face => ({ value: rankValue(rank), suit })));

/** The category of the size of each group of cards, from the largest, five different ranks aside */
const CATEGORY_OF_GROUPS: Readonly<Record<string, HandCategory>> = {
    '5': HandCategory.FIVE_OF_A_KIND,
    '41': HandCategory.FOUR_OF_A_KIND,
    '32': HandCategory.FULL_HOUSE,
    '311': HandCategory.THREE_OF_A_KIND,
    '221': HandCategory.TWO_PAIR,
    '2111': HandCategory.ONE_PAIR,
};

/** The category of five cards of different ranks */
function distinctCategory(straight: boolean, flush: boolean, aceHigh: boolean): HandCategory {
    if (straight && flush) {
        return aceHigh ? HandCategory.ROYAL_FLUSH : HandCategory.STRAIGHT_FLUSH;
    }
    if (straight) {
        return HandCategory.STRAIGHT;
    }
    return flush ? HandCategory.FLUSH : HandCategory.HIGH_CARD;
}

function faceValue(faces: ReadonlyArray<Face>, joker: boolean): HandValue {
    const counts: Map<number, number> = new Map<number, number>();
    faces.forEach((face: Face) => counts.set(face.value, (counts.get(face.value) ?? 0) + 1));
    const groups: [number, number][] = [...counts].sort(([valueA, countA]: [number, number], [valueB, countB]: [number, number]): number => countB - countA || valueB - valueA);
    const values: number[] = groups.map(([value]: [number, number]) => value);

    if (groups.length < HAND_SIZE) {
        return { category: CATEGORY_OF_GROUPS[groups.map(([, count]: [number, number]) => count).join('')], ranks: values.map((value: number) => rankOf(value)), joker };
    }

    const wheel: boolean = values.every((value: number, index: number) => value === WHEEL[index]);
    const straight: boolean = wheel || values[0] - values[HAND_SIZE - 1] === HAND_SIZE - 1;
    const flush: boolean = faces.every((face: Face) => face.suit === faces[0].suit);

    return {
        category: distinctCategory(straight, flush, values[0] === ACE && !wheel),
        ranks: (wheel ? [...values.slice(1), ACE] : values).map((value: number) => rankOf(value)),
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
