import SynchronousChessGameSession from './synchronous-chess-game-session';
import { PieceColor } from '../rules/chess-rules';

export default class SynchronousChessLocalGameSession extends SynchronousChessGameSession {

    public myColor: PieceColor = PieceColor.NONE;
    public get playingColor(): PieceColor {
        return PieceColor.NONE;
    }

    public move(): void {

    }

    public skip(): void {

    }

    public promote(): void {

    }

}
