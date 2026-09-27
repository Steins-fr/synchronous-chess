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

    test('should expose the configuration and the game board', () => {
        // Given
        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();
        session.configuration = { spectatorNumber: 2 };

        // When
        const spectatorNumber: number = session.spectatorNumber;
        const board: FenBoard = session.board;

        // Then
        expect(spectatorNumber).toEqual(2);
        expect(board).toBe(session.game.fenBoard);
    });

    test('should ignore the player actions', () => {
        // Given
        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();
        const board: FenBoard = session.board;

        // When
        session.move();
        session.skip();
        session.promote();
        session.destroy();

        // Then
        expect(session.board).toBe(board);
        expect(session.movePreview).toBeUndefined();
    });
});
