import { PieceColor } from '../rules/chess-rules';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';

describe('SynchronousChessLocalGameSession', () => {
    it('should create an instance', () => {
        expect(new SynchronousChessLocalGameSession()).toBeTruthy();
    });

    it('should get default none color', () => {
        // Given

        const session: SynchronousChessLocalGameSession = new SynchronousChessLocalGameSession();

        // When

        const color: PieceColor = session.playingColor;

        expect(color).toEqual(PieceColor.NONE);
    });
});
