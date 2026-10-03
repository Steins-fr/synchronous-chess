import { PieceColor } from '../../enums/piece-color.enum';

export enum GameEndReason {
    CHECKMATE = 'checkmate',
    /** Both players are checkmated at the same time: a draw */
    DOUBLE_CHECKMATE = 'doubleCheckmate',
    /** A player, not in check, can not move any piece: a draw */
    STALEMATE = 'stalemate',
    /** The same position starts a synchronous turn for the third time: a draw */
    THREEFOLD_REPETITION = 'threefoldRepetition',
    /** 50 synchronous turns without a pawn move nor a capture: a draw */
    FIFTY_TURNS = 'fiftyTurns',
    /** No piece left can checkmate: a draw */
    INSUFFICIENT_MATERIAL = 'insufficientMaterial',
}

export interface GameResult {
    /** The winning color, none for a draw */
    readonly winner: PieceColor;
    readonly reason: GameEndReason;
}
