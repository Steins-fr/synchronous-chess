import SynchronousChessGameSession from './synchronous-chess-game-session';
import { PieceColor } from '../rules/chess-rules';

export default class SynchronousChessLocalGameSession extends SynchronousChessGameSession {

    public get playerColor(): PieceColor {
        return PieceColor.NONE;
    }
}
