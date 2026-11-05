/** What a trunk holds, and what the inspector calls */
export enum ContrabandVariant {
    /** The manga's: any amount from 0 to 100 million, the inspector passing or doubting an amount */
    CLASSIC = 'classic',
    /** A gold bar of 100 million or an iron bar, the inspector passing or checking */
    GOLD_RUSH = 'goldRush',
}

/** The countries: the players of the seats 0 to 3 are of the North, the others of the South */
export enum Team {
    NORTH = 'north',
    SOUTH = 'south',
}

export enum CallKind {
    /** The trunk goes through: its contents reach the account of the smuggler */
    PASS = 'pass',
    /** Classic: the inspector names an amount, seizing the contents up to it */
    DOUBT = 'doubt',
    /** Gold Rush: the inspector opens the trunk */
    CHECK = 'check',
}

/** What the inspector calls */
export type Call =
    | { readonly kind: CallKind.PASS }
    | { readonly kind: CallKind.DOUBT; readonly amount: number }
    | { readonly kind: CallKind.CHECK };

/** What the player starting a game picks: the variant, the seconds of the customs and the number of games */
export interface ContrabandSetup {
    readonly variant: ContrabandVariant;
    readonly customsTime: number;
    readonly games: number;
}

/** The amounts are in millions */
export interface ContrabandRules {
    /** The seats of the table, the first half of the North, the other one of the South */
    readonly seats: number;
    /** The seats of a country */
    readonly teamSeats: number;
    /** The players each country needs, the countries of the same size */
    readonly minTeam: number;
    /**
     * The seconds of each phase, a phase closing as soon as its player acted: to commit and reveal the random parts of the
     * draw, to pack a trunk, to reveal it. They exceed the 10 seconds of the watch of the censorship: a sequencer holding
     * the reveal of a smuggler, which would seize its trunk, is caught before the end
     */
    readonly drawTime: number;
    readonly packingTime: number;
    readonly revealTime: number;
    /** The seconds of the customs the player starting a game may pick, the default among them */
    readonly customsTimes: ReadonlyArray<number>;
    readonly defaultCustomsTime: number;
    /** The numbers of games the player starting a game may pick, even: each country smuggles half of them */
    readonly gameCounts: ReadonlyArray<number>;
    readonly defaultGames: number;
    /** The seconds more a phase waits for a player away, once */
    readonly awayTime: number;
    /** The money each player starts with in its ATM, the only one it may pack */
    readonly atm: number;
    /** The money each player starts with on its account of the third country */
    readonly account: number;
    /** The money each player owes at the end */
    readonly debt: number;
    /** The most a trunk holds, in the classic variant */
    readonly maxTrunk: number;
    /** The most an inspector doubts */
    readonly maxDoubt: number;
    /** The money of a gold bar, in the Gold Rush */
    readonly goldBar: number;
}

/** The Contraband of Liar Game: two countries of 1 to 4 players, each player smuggling its money across the customs of the other one */
export const CONTRABAND_RULES: ContrabandRules = {
    seats: 8,
    teamSeats: 4,
    minTeam: 1,
    drawTime: 20,
    packingTime: 60,
    revealTime: 15,
    customsTimes: [60, 120, 300],
    defaultCustomsTime: 120,
    gameCounts: [10, 20, 30],
    defaultGames: 10,
    awayTime: 15,
    atm: 300,
    account: 100,
    debt: 400,
    maxTrunk: 100,
    maxDoubt: 100,
    goldBar: 100,
};

export function isVariant(value: unknown): value is ContrabandVariant {
    return (Object.values(ContrabandVariant) as unknown[]).includes(value);
}

/** Whether a setup received from the network is one the rules offer */
export function isSetup(
    rules: ContrabandRules, setup: { readonly variant: unknown; readonly customsTime: unknown; readonly games: unknown },
): setup is ContrabandSetup {
    return isVariant(setup.variant) && (rules.customsTimes as unknown[]).includes(setup.customsTime) && (rules.gameCounts as unknown[]).includes(setup.games);
}

/**
 * Whether a call received from the network is one of the variant: a pass, or a doubt of an integer amount from 1 to the
 * most an inspector doubts in the classic variant, a check in the Gold Rush
 */
export function isCall(rules: ContrabandRules, variant: ContrabandVariant, value: unknown): value is Call {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const { kind, amount } = value as { readonly kind?: unknown; readonly amount?: unknown };
    switch (kind) {
        case CallKind.PASS:
            return amount === undefined;
        case CallKind.DOUBT:
            return variant === ContrabandVariant.CLASSIC && Number.isInteger(amount) && (amount as number) >= 1 && (amount as number) <= rules.maxDoubt;
        case CallKind.CHECK:
            return variant === ContrabandVariant.GOLD_RUSH && amount === undefined;
        default:
            return false;
    }
}

/** The most a trunk holds in the classic variant: the money left in the ATM of its smuggler, up to the most a trunk holds */
export function trunkLimit(rules: ContrabandRules, atm: number): number {
    return Math.min(rules.maxTrunk, atm);
}

/**
 * Whether a trunk is one the smuggler may pack: an integer amount from 0 to its limit in the classic variant, an iron
 * bar (0) or a gold bar the ATM holds in the Gold Rush
 */
export function isTrunk(rules: ContrabandRules, variant: ContrabandVariant, atm: number, value: unknown): value is number {
    if (variant === ContrabandVariant.GOLD_RUSH) {
        return value === 0 || (value === rules.goldBar && atm >= rules.goldBar);
    }
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= trunkLimit(rules, atm);
}

/** The country of a player, the players in the order of their seats: the North ones first */
export function teamOf(player: number, north: number): Team {
    return player < north ? Team.NORTH : Team.SOUTH;
}
