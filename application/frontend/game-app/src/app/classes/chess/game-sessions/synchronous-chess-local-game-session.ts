import SynchronousChessGameSession from './synchronous-chess-game-session';
import { PieceColor } from '../rules/chess-rules';

export default class SynchronousChessLocalGameSession extends SynchronousChessGameSession {

    public myColor: PieceColor = PieceColor.NONE;
    public get playingColor(): PieceColor {
        return PieceColor.NONE;
    }

    public move(): void {
        // Nothing to do
    }

    public skip(): void {
        // Nothing to do
    }

    public promote(): void {
        // Nothing to do
    }

    public override destroy(): void {
        // Nothing to do
    }
}
