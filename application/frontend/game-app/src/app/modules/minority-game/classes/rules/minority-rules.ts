/** How a game counts its votes */
export enum MinorityVariant {
    /** The manga's: the majority side is eliminated, down to the last 1 or 2 players */
    ELIMINATION = 'elimination',
    /** No elimination: the minority side scores, over a fixed number of rounds */
    SCORE = 'score',
}

export enum Vote {
    YES = 'yes',
    NO = 'no',
}

/** What the player starting a game picks: the variant, and the seconds of a vote */
export interface MinoritySetup {
    readonly variant: MinorityVariant;
    readonly voteTime: number;
}

export interface MinorityRules {
    /** The seats of the table */
    readonly seats: number;
    /** The players a game needs */
    readonly minPlayers: number;
    /**
     * The seconds of each phase, a phase closing as soon as every player acted: to commit and reveal the random parts of
     * the draw, to ask a question, to reveal the votes. They exceed the 10 seconds of the watch of the censorship: a
     * sequencer holding the votes of the others is caught before the end
     */
    readonly drawTime: number;
    readonly questionTime: number;
    readonly revealTime: number;
    /** The seconds of a vote the player starting a game may pick, the default among them */
    readonly voteTimes: ReadonlyArray<number>;
    readonly defaultVoteTime: number;
    /** The seconds more a phase waits for a player away, once */
    readonly awayTime: number;
    /** The rounds of the score variant */
    readonly rounds: number;
    /** The millions each player brings in the elimination variant, the winners sharing them */
    readonly stake: number;
}

/** The Minority Game of Liar Game: from 3 to 8 players, 100 million each, or 10 scored rounds */
export const MINORITY_RULES: MinorityRules = {
    seats: 8,
    minPlayers: 3,
    drawTime: 20,
    questionTime: 60,
    revealTime: 15,
    voteTimes: [30, 60, 120, 300],
    defaultVoteTime: 60,
    awayTime: 15,
    rounds: 10,
    stake: 100,
};

export function isVariant(value: unknown): value is MinorityVariant {
    return (Object.values(MinorityVariant) as unknown[]).includes(value);
}

export function isVote(value: unknown): value is Vote {
    return (Object.values(Vote) as unknown[]).includes(value);
}

/** Whether a setup received from the network is one the rules offer */
export function isSetup(rules: MinorityRules, setup: { readonly variant: unknown; readonly voteTime: unknown }): setup is MinoritySetup {
    return isVariant(setup.variant) && (rules.voteTimes as unknown[]).includes(setup.voteTime);
}
