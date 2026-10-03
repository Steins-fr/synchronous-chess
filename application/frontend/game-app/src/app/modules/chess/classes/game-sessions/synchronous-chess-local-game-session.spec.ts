import { sessionState } from '@testing/chess-state.helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { PieceColor } from '../../enums/piece-color.enum';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';
import { describe, test, expect } from 'vitest';

describe('SynchronousChessLocalGameSession', () => {
    test('should create an instance', () => {
        expect(new SynchronousChessLocalGameSession()).toBeTruthy();
    });

    test('should get default none color', () => {
        // Given

        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();

        // When

        const color: PieceColor = session.playingColor;

        expect(color).toEqual(PieceColor.NONE);
    });

    test('should expose the configuration and the game board, without seats nor spectators', () => {
        // Given
        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();
        sessionState(session).setConfiguration({ whitePlayer: 'a' });

        // When
        const board: FenBoard = session.board();

        // Then
        expect(session.configuration()).toEqual({ whitePlayer: 'a' });
        expect(session.spectatorNumber()).toEqual(0);
        expect(session.seatsOpen()).toEqual(false);
        expect(board).toBe(session.game.fenBoard());
    });

    test('should ignore the player actions', () => {
        // Given
        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();
        const board: FenBoard = session.board();

        // When
        session.takeSeat();
        session.leaveSeat();
        session.move();
        session.skip();
        session.promote();
        session.destroy();

        // Then
        expect(session.board()).toBe(board);
        expect(session.movePreview()).toBeUndefined();
    });
});
