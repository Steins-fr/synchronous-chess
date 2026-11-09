/** The end of the game for a player */
export interface EdenStanding {
    /** The index of the player, among the players in the order of their seats */
    readonly player: number;
    /** Its place, 1 the first: equal balances share it */
    readonly place: number;
    readonly winner: boolean;
    /** Its millions at the end */
    readonly balance: number;
    /** The round it lost paradise, none for a player still in */
    readonly outAt: number | null;
}

export interface EdenResult {
    /** The players of the first place still in paradise, none when every player lost it */
    readonly winners: ReadonlyArray<number>;
    /** In the order of the players */
    readonly standings: ReadonlyArray<Readonly<EdenStanding>>;
}

/** The place of each key, the highest first: 1 plus the keys above it, equal keys sharing a place */
export function placesOf(keys: ReadonlyArray<number>): number[] {
    return keys.map((key: number) => 1 + keys.filter((other: number) => other > key).length);
}

/**
 * The end of the game: the highest balance wins, equal balances sharing their place. A player out of paradise never
 * wins: its balance is below the one of every player still in, so the first place is out only once every player is
 */
export function settleEden(balances: ReadonlyArray<number>, outAt: ReadonlyArray<number | null>): EdenResult {
    const places: number[] = placesOf(balances);
    const standings: EdenStanding[] = balances.map((balance: number, player: number): EdenStanding =>
        ({ player, place: places[player], winner: places[player] === 1 && outAt[player] === null, balance, outAt: outAt[player] }));

    return {
        winners: standings.filter((standing: EdenStanding) => standing.winner).map((standing: EdenStanding) => standing.player),
        standings,
    };
}
