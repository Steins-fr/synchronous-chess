import { WritableSignal } from '@angular/core';
import SynchronousChessGameSession, { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessGame from '@app/modules/chess/classes/games/synchronous-chess-game';
import Turn from '@app/modules/chess/classes/turns/turn';
import CoordinateMove from '@app/modules/chess/interfaces/CoordinateMove';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { TestHelper } from './test.helper';

interface SynchronousChessGameState {
    readonly _fenBoard: WritableSignal<FenBoard>;
    readonly _turn: WritableSignal<Turn>;
    readonly _oldTurn: WritableSignal<Turn | null>;
    readonly _isWhiteInCheck: WritableSignal<boolean>;
    readonly _isWhiteInCheckmate: WritableSignal<boolean>;
    readonly _isBlackInCheck: WritableSignal<boolean>;
    readonly _isBlackInCheckmate: WritableSignal<boolean>;
}

interface SynchronousChessGameSessionState {
    readonly _movePreview: WritableSignal<Readonly<CoordinateMove> | undefined>;
    setConfiguration(configuration: Readonly<SessionConfiguration>): void;
}

/**
 * Gives access to the writable state of a game, to put it in a given situation
 */
export function gameState(game: SynchronousChessGame): SynchronousChessGameState {
    return TestHelper.cast<SynchronousChessGameState>(game);
}

/**
 * Gives access to the writable state of a game session, to put it in a given situation
 */
export function sessionState(session: SynchronousChessGameSession): SynchronousChessGameSessionState {
    return TestHelper.cast<SynchronousChessGameSessionState>(session);
}
