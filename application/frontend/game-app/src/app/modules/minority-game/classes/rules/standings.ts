import { placesOf } from '@app/modules/commit-reveal/classes/places';
import { MinorityRules, MinorityVariant } from './minority-rules';

/** The end of the game for a player */
export interface MinorityStanding {
    /** The index of the player, among the players in the order of their seats */
    readonly player: number;
    /** Its place, 1 the first: equal players share it */
    readonly place: number;
    readonly winner: boolean;
    /** Its total, in the score variant */
    readonly points: number | null;
    /** The question that eliminated it, in the elimination variant: none for a winner */
    readonly eliminatedAt: number | null;
    /** The millions it won or lost, in the elimination variant: its share of the stakes minus its own */
    readonly balance: number | null;
}

export interface MinorityResult {
    readonly variant: MinorityVariant;
    /** The players of the first place, none when the last vote eliminated every player left */
    readonly winners: ReadonlyArray<number>;
    /** In the order of the players */
    readonly standings: ReadonlyArray<Readonly<MinorityStanding>>;
}

/**
 * The end of the elimination variant: the players left win, sharing the stakes of every player; the others rank by the
 * question that eliminated them, the latest first, the players of one question sharing their place
 */
export function settleElimination(alive: ReadonlyArray<number>, eliminatedAt: ReadonlyArray<number | null>, rules: MinorityRules): MinorityResult {
    const places: number[] = placesOf(eliminatedAt.map((round: number | null) => round ?? Number.POSITIVE_INFINITY));
    const share: number = alive.length === 0 ? 0 : Math.floor(eliminatedAt.length * rules.stake / alive.length);
    const standings: MinorityStanding[] = eliminatedAt.map((round: number | null, player: number): MinorityStanding => {
        const winner: boolean = alive.includes(player);
        return { player, place: places[player], winner, points: null, eliminatedAt: round, balance: (winner ? share : 0) - rules.stake };
    });

    return { variant: MinorityVariant.ELIMINATION, winners: alive, standings };
}

/** The end of the score variant: the highest total wins, equal totals sharing their place */
export function settleScore(scores: ReadonlyArray<number>): MinorityResult {
    const places: number[] = placesOf(scores);
    const standings: MinorityStanding[] = scores.map((points: number, player: number): MinorityStanding =>
        ({ player, place: places[player], winner: places[player] === 1, points, eliminatedAt: null, balance: null }));

    return {
        variant: MinorityVariant.SCORE,
        winners: standings.filter((standing: MinorityStanding) => standing.winner).map((standing: MinorityStanding) => standing.player),
        standings,
    };
}
