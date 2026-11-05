import { ContrabandRules, Team, teamOf } from './contraband-rules';

/** The money of a player during a match, in millions */
export interface Ledger {
    /** Left in its ATM */
    readonly atm: number;
    /** Smuggled to its account */
    readonly smuggled: number;
    /** Seized as an inspector, to its account */
    readonly seized: number;
    /** The indemnities received as a smuggler, minus the ones paid as an inspector */
    readonly indemnities: number;
}

/** The end of the match for a player */
export interface ContrabandStanding {
    /** The index of the player, among the players in the order of their seats */
    readonly player: number;
    readonly team: Team;
    readonly atm: number;
    readonly smuggled: number;
    readonly seized: number;
    readonly indemnities: number;
    /** Its share of the ATMs of the other country, rounded to the hundredth */
    readonly share: number;
    /** What it won or lost: its account, its share and its debt, rounded to the hundredth */
    readonly balance: number;
}

export interface ContrabandResult {
    /** The country of the highest total, none on a tie */
    readonly winner: Team | null;
    /** The balances of the players of each country, summed exactly: they sum to 0 */
    readonly totals: Readonly<Record<Team, number>>;
    /** In the order of the players */
    readonly standings: ReadonlyArray<Readonly<ContrabandStanding>>;
}

const sum = (amounts: ReadonlyArray<number>): number => amounts.reduce((total: number, amount: number) => total + amount, 0);
const hundredths = (amount: number): number => Math.round(amount * 100) / 100;

/**
 * The end of the match: the money left in the ATMs of a country goes to the other one, shared alike between its
 * players. Each player then holds its account, its share, and owes its debt; the country of the highest total wins.
 *
 * The totals never divide: the amounts are halves at most, summed exactly, so a tie is told and the totals sum to 0. Only
 * the shares of a player, thirds among 3 players, are rounded
 *
 * @param north the players of each country
 * @param ledgers the money of each player, in the order of their seats: the North ones first
 */
export function settleContraband(rules: ContrabandRules, north: number, ledgers: ReadonlyArray<Readonly<Ledger>>): ContrabandResult {
    const teamLedgers = (team: Team): ReadonlyArray<Readonly<Ledger>> => ledgers.filter((_, player: number) => teamOf(player, north) === team);
    const left = (team: Team): number => sum(teamLedgers(team).map((ledger: Readonly<Ledger>) => ledger.atm));
    const other = (team: Team): Team => team === Team.NORTH ? Team.SOUTH : Team.NORTH;
    const earned = (ledger: Readonly<Ledger>): number => ledger.smuggled + ledger.seized + ledger.indemnities;
    const total = (team: Team): number =>
        sum(teamLedgers(team).map((ledger: Readonly<Ledger>) => earned(ledger))) + left(other(team)) + teamLedgers(team).length * (rules.account - rules.debt);

    const standings: ContrabandStanding[] = ledgers.map((ledger: Readonly<Ledger>, player: number): ContrabandStanding => {
        const team: Team = teamOf(player, north);
        const share: number = left(other(team)) / north;
        return {
            player,
            team,
            atm: ledger.atm,
            smuggled: ledger.smuggled,
            seized: ledger.seized,
            indemnities: ledger.indemnities,
            share: hundredths(share),
            balance: hundredths(earned(ledger) + share + rules.account - rules.debt),
        };
    });
    const totals: Record<Team, number> = { [Team.NORTH]: total(Team.NORTH), [Team.SOUTH]: total(Team.SOUTH) };
    let winner: Team | null = null;
    if (totals[Team.NORTH] !== totals[Team.SOUTH]) {
        winner = totals[Team.NORTH] > totals[Team.SOUTH] ? Team.NORTH : Team.SOUTH;
    }

    return { winner, totals, standings };
}
