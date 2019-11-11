import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece } from '../piece/piece';

export enum MoveType {
    LINEAR = 'linear',
    HOP = 'hop',
    DOUBLE_HOP = 'double-hop',
    FEAR_HOP = 'fear-hop',
    CONDITIONAL = 'conditional'
}

export default abstract class Move {
    public constructor(public readonly type: MoveType) { }

    public abstract possiblePlays(position: Vec2, board: FenBoard): Array<Vec2>;

    protected validPosition(position: Vec2, board: FenBoard): void {
        if (ChessHelper.isOutOfBoard(position)
            || ChessHelper.getFenPiece(board, position) === FenPiece.EMPTY) {
            throw Error('The movement origin have to be valid.');
        }
    }
}
