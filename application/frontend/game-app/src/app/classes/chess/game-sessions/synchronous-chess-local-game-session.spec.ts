import { PieceColor } from '../rules/chess-rules';
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
});
