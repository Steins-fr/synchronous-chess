import { NgZone } from '@angular/core';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';
import { PieceColor } from '../rules/chess-rules';

describe('SynchronousChessLocalGameSession', () => {
    it('should create an instance', () => {
        expect(new SynchronousChessLocalGameSession(null as unknown as NgZone)).toBeTruthy();
    });

    it('should get default none color', () => {
        // Given

        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession(null as unknown as NgZone);

        // When

        const color: PieceColor = session.playingColor;

        expect(color).toEqual(PieceColor.NONE);
    });
});
