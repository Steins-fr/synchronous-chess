import { SeatPayloads } from '@app/modules/game-table/classes/table-seats';

/** The game of a message, a match of the Contraband: a message of another one is void */
export interface GameRound {
    /** The index of the game in the room */
    game: number;
    /** The draws of the game: a draw timing out starts again */
    attempt: number;
}

/**
 * The start of the game, with the players it names, a commitment of a player to its random part of the draw, or a
 * random part revealed. A game adds its setup to the start
 */
export interface DrawMessage extends GameRound {
    /** The players the start names, the seated ones in the order of their seats: a start naming others is void */
    players?: ReadonlyArray<string>;
    commitment?: string;
    part?: string;
}

export interface TimeoutMessage extends GameRound {
    /** The step the claim waited at: a move applied meanwhile voids it */
    step: number;
}

export interface RematchMessage {
    /** The index of the new game in the room */
    game: number;
}

/** The types of the messages every game committing then revealing its moves sends, beside its own moves */
export interface CommitRevealTypes {
    readonly seat: string;
    readonly unseat: string;
    readonly draw: string;
    readonly timeout: string;
    readonly rematch: string;
}

/** The messages every game committing then revealing its moves sends, by their types, with the start of its draw */
export type CommitRevealPayloads<Types extends CommitRevealTypes, Draw extends DrawMessage> = SeatPayloads<Types['seat'], Types['unseat']>
    & Record<Types['draw'], Draw> & Record<Types['timeout'], TimeoutMessage> & Record<Types['rematch'], RematchMessage>;
