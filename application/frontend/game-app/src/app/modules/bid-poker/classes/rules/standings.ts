import { BestHand, bestHand, compareHands, HAND_SIZE } from '@app/modules/playing-cards/helpers/hand-evaluator.helper';
import { BidPokerRules } from './bid-poker-rules';

/** The end of the game for a player */
export interface Standing {
    /** The index of the player, among the players in the order of their seats */
    readonly player: number;
    /** Its best 5 cards, none under 5 cards */
    readonly best: Readonly<BestHand> | null;
    /** Its place among the players who are not pigs, 1 the first; null for a pig, last */
    readonly place: number | null;
    readonly pig: boolean;
    /** The coins it wins, its share of the prizes of the places it covers */
    readonly prize: number;
    /** The coins it pays as a pig */
    readonly fine: number;
    /** Its coins at the end of the game, the debt paid, the fine paid and the prize won */
    readonly balance: number;
}

export interface BidPokerResult {
    /** In the order of the players */
    readonly standings: ReadonlyArray<Readonly<Standing>>;
    readonly pigs: number;
    /** The fines no prize paid: the rounding of a share, a place without a player. They go to the bank */
    readonly unpaid: number;
}

/**
 * The end of the game. The pigs are the last place: every player without a hand (fewer than 5 cards) or, when every
 * player has one, the players of the worst hand. Every pig pays its fine, and the others share the prizes by place,
 * multiplied by the number of pigs: equal hands share the prizes of the places they cover, in whole coins.
 */
export function settle(holdings: ReadonlyArray<ReadonlyArray<number>>, coins: ReadonlyArray<number>, rules: BidPokerRules): BidPokerResult {
    const hands: ReadonlyArray<Readonly<BestHand> | null> = holdings.map((held: ReadonlyArray<number>) =>
        held.length < HAND_SIZE ? null : bestHand(held.map((id: number) => rules.deck[id])));
    const pigs: ReadonlySet<number> = pigsOf(hands);
    const ranked: number[] = hands.map((_, player: number) => player).filter((player: number) => !pigs.has(player))
        .sort((one: number, other: number) => compareHands(handOf(hands, other), handOf(hands, one)));
    const places = new Map<number, { place: number; prize: number }>();

    for (let start = 0; start < ranked.length;) {
        const group: number[] = ranked.filter((player: number) => compareHands(handOf(hands, player), handOf(hands, ranked[start])) === 0);
        const pool: number = rules.prizes.slice(start, start + group.length).reduce((sum: number, prize: number) => sum + prize, 0) * pigs.size;
        group.forEach((player: number) => places.set(player, { place: start + 1, prize: Math.floor(pool / group.length) }));
        start += group.length;
    }

    const standings: Standing[] = hands.map((best: Readonly<BestHand> | null, player: number): Standing => {
        const pig: boolean = pigs.has(player);
        const fine: number = pig ? rules.pigFine : 0;
        const prize: number = places.get(player)?.prize ?? 0;
        return { player, best, place: places.get(player)?.place ?? null, pig, prize, fine, balance: coins[player] - rules.debt - fine + prize };
    });

    return {
        standings,
        pigs: pigs.size,
        unpaid: pigs.size * rules.pigFine - standings.reduce((sum: number, standing: Standing) => sum + standing.prize, 0),
    };
}

/** Every player without a hand, else the players of the worst hand: all of them when every hand is equal */
function pigsOf(hands: ReadonlyArray<Readonly<BestHand> | null>): ReadonlySet<number> {
    const players: number[] = hands.map((_, player: number) => player);
    const without: number[] = players.filter((player: number) => hands[player] === null);

    if (without.length > 0) {
        return new Set(without);
    }

    const worst: number = players.reduce((lowest: number, player: number) =>
        compareHands(handOf(hands, player), handOf(hands, lowest)) < 0 ? player : lowest, 0);
    return new Set(players.filter((player: number) => compareHands(handOf(hands, player), handOf(hands, worst)) === 0));
}

function handOf(hands: ReadonlyArray<Readonly<BestHand> | null>, player: number): BestHand['value'] {
    return (hands[player] as Readonly<BestHand>).value;
}
