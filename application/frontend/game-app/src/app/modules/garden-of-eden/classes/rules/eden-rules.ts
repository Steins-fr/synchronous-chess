/** The apple a player votes for, each round */
export enum Apple {
    GOLD = 'gold',
    SILVER = 'silver',
    /** The apple of truth: every player wins only if every player picks it */
    RED = 'red',
}

/** What the player starting a game picks: the seconds of a vote, and the millions each player starts with */
export interface EdenSetup {
    readonly voteTime: number;
    readonly startMoney: number;
}

/** The amounts are in millions */
export interface EdenRules {
    /** The seats of the table */
    readonly seats: number;
    /** The players a game needs */
    readonly minPlayers: number;
    /**
     * The seconds of each phase, a phase closing as soon as every player acted: to commit and reveal the random parts of
     * the draw, to reveal the apples. They exceed the 10 seconds of the watch of the censorship: a sequencer holding the
     * apples of the others is caught before the end
     */
    readonly drawTime: number;
    readonly revealTime: number;
    /** The seconds of a vote the player starting a game may pick, the default among them */
    readonly voteTimes: ReadonlyArray<number>;
    readonly defaultVoteTime: number;
    /** The millions each player starts with, the player starting a game picking them, the default among them */
    readonly startMoneys: ReadonlyArray<number>;
    readonly defaultStartMoney: number;
    /** The seconds more a phase waits for a player away, once */
    readonly awayTime: number;
    /** The rounds of a game */
    readonly rounds: number;
    /** What most lines of the count win or lose */
    readonly gain: number;
    /** What the lone gold or silver apple among red ones wins */
    readonly loneGain: number;
    /** What the lone red apple among gold or silver ones loses */
    readonly loneRedLoss: number;
    /** What a player still in loses not voting in time */
    readonly missPenalty: number;
    /**
     * What a player loses withholding its apple once committed, or revealing it otherwise than committed: as much as a
     * lone red apple, so the last player to reveal never saves its loss reading the apples of the others
     */
    readonly withheldPenalty: number;
    /** A balance at or below it after a round loses paradise: its player is out for the rest of the game */
    readonly paradiseFloor: number;
}

/** The Garden of Eden of Liar Game: from 3 to 8 players, 13 rounds */
export const EDEN_RULES: EdenRules = {
    seats: 8,
    minPlayers: 3,
    drawTime: 20,
    revealTime: 15,
    voteTimes: [30, 60, 120, 300],
    defaultVoteTime: 60,
    startMoneys: [0, 500, 1000],
    defaultStartMoney: 0,
    awayTime: 15,
    rounds: 13,
    gain: 100,
    loneGain: 200,
    loneRedLoss: 1000,
    missPenalty: 100,
    withheldPenalty: 1000,
    paradiseFloor: -500,
};

export function isApple(value: unknown): value is Apple {
    return (Object.values(Apple) as unknown[]).includes(value);
}

/** Whether a setup received from the network is one the rules offer */
export function isSetup(rules: EdenRules, setup: { readonly voteTime: unknown; readonly startMoney: unknown }): setup is EdenSetup {
    return (rules.voteTimes as unknown[]).includes(setup.voteTime) && (rules.startMoneys as unknown[]).includes(setup.startMoney);
}
