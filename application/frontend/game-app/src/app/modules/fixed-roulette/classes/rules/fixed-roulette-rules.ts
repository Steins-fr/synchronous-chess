/** The roles of the two players in a game, swapped each game */
export enum Side {
    /** It seals the pocket of the ball, then bets first, in public */
    CROUPIER = 'croupier',
    /** It bets second, on the pockets it reads the croupier's bets on */
    PUNTER = 'punter',
}

/** The chips a player bets on each pocket of the wheel, the first pocket first: whole numbers, 0 for a pocket left bare */
export type Bets = ReadonlyArray<number>;

/** Why bets are refused */
export enum BetError {
    /** No chip bet: the croupier bets 1 chip at least */
    NONE = 'none',
    /** More chips than the player holds */
    OVER = 'over',
    /** More pockets than the side may cover: the punter covers 2 at most */
    POCKETS = 'pockets',
    /** The punter holds less than the croupier's total: it bets every chip it holds */
    ALL_IN = 'allIn',
    /** The punter bets less than the croupier's total */
    UNDER = 'under',
}

/** What the player starting a match picks: the seconds of the croupier's and the punter's bets */
export interface FixedRouletteSetup {
    readonly betTime: number;
}

export interface FixedRouletteRules {
    /** The seats of the table, one per player */
    readonly seats: number;
    /**
     * The seconds of each phase, a phase closing as soon as its player acted: to commit and reveal the random parts of the
     * draw, to reveal the ball. They exceed the 10 seconds of the watch of the censorship: a sequencer holding the reveal
     * of a croupier, which would forfeit the match, is caught before the end
     */
    readonly drawTime: number;
    readonly revealTime: number;
    /** The seconds of the bets the player starting a match may pick, the default among them */
    readonly betTimes: ReadonlyArray<number>;
    readonly defaultBetTime: number;
    /** The seconds more a phase waits for a player away, once */
    readonly awayTime: number;
    /** The pockets of the wheel, numbered from 1 */
    readonly pockets: number;
    /** The most pockets the punter covers */
    readonly punterPockets: number;
    /** The games of a match, even: each player is the croupier of half of them */
    readonly games: number;
    /** The chips each player starts the match with */
    readonly startChips: number;
}

/** The roulette that does not spin, of Liar Game: a duel on a fixed wheel of 4 pockets, over 10 games */
export const FIXED_ROULETTE_RULES: FixedRouletteRules = {
    seats: 2,
    drawTime: 20,
    revealTime: 15,
    betTimes: [30, 60, 120, 300],
    defaultBetTime: 60,
    awayTime: 15,
    pockets: 4,
    punterPockets: 2,
    games: 10,
    startChips: 500,
};

/** Whether a setup received from the network is one the rules offer */
export function isSetup(rules: FixedRouletteRules, setup: { readonly betTime: unknown }): setup is FixedRouletteSetup {
    return (rules.betTimes as unknown[]).includes(setup.betTime);
}

/** Whether a value is a pocket of the wheel: a whole number from 1 to the pockets */
export function isPocket(rules: FixedRouletteRules, value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= rules.pockets;
}

/** Whether a value received from the network has the shape of bets: a whole number of chips, 0 or more, for each pocket */
export function isBets(rules: FixedRouletteRules, value: unknown): value is Bets {
    return Array.isArray(value) && value.length === rules.pockets && value.every((chips: unknown) => Number.isInteger(chips) && (chips as number) >= 0);
}

/** The chips of the bets, on every pocket */
export function totalOf(bets: Bets): number {
    return bets.reduce((total: number, chips: number) => total + chips, 0);
}

/** The pockets holding chips, numbered from 1 */
export function coveredPockets(bets: Bets): ReadonlyArray<number> {
    return bets.flatMap((chips: number, index: number) => chips > 0 ? [index + 1] : []);
}

/** The least the punter bets: the croupier's total, or every chip it holds when it holds less */
export function punterMinimum(chips: number, croupierTotal: number): number {
    return Math.min(chips, croupierTotal);
}

/**
 * Why the bets of a side are refused, none when the rules allow them: the one check of the forms and of every page.
 *
 * The croupier bets 1 chip at least, on any pockets; the punter on 2 pockets at most, at least the croupier's total, or
 * every chip it holds when it holds less. No side bets more chips than it holds
 *
 * @param chips the chips the player holds before betting
 * @param croupierTotal the chips the croupier bet, read for the punter only
 */
export function betError(rules: FixedRouletteRules, side: Side, chips: number, croupierTotal: number, bets: Bets): BetError | null {
    const total: number = totalOf(bets);

    if (total > chips) {
        return BetError.OVER;
    }
    if (side === Side.PUNTER && coveredPockets(bets).length > rules.punterPockets) {
        return BetError.POCKETS;
    }
    if (side === Side.PUNTER && total < punterMinimum(chips, croupierTotal)) {
        return chips < croupierTotal ? BetError.ALL_IN : BetError.UNDER;
    }
    return total === 0 ? BetError.NONE : null;
}

/** Whether a value received from the network is bets the croupier may place */
export function isCroupierBet(rules: FixedRouletteRules, chips: number, value: unknown): value is Bets {
    return isBets(rules, value) && betError(rules, Side.CROUPIER, chips, 0, value) === null;
}

/** Whether a value received from the network is bets the punter may place, after the croupier's total */
export function isPunterBet(rules: FixedRouletteRules, chips: number, croupierTotal: number, value: unknown): value is Bets {
    return isBets(rules, value) && betError(rules, Side.PUNTER, chips, croupierTotal, value) === null;
}

/**
 * The croupier of a game, the players by turns
 *
 * @param round the index of the game in the match
 * @param first the croupier of the first game, drawn
 */
export function croupierOf(round: number, first: number): number {
    return (first + round) % 2;
}

/** The side of a player in a game */
export function sideOf(player: number, croupier: number): Side {
    return player === croupier ? Side.CROUPIER : Side.PUNTER;
}
