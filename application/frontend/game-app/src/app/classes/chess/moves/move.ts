import Vec2 from 'vec2';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import { FenPiece } from '../piece/piece';

export enum MoveType {
    LINEAR = 'linear',
    HOP = 'hop',
    FEAR_HOP = 'fear-hop'
}

export default abstract class Move {
    public constructor(public readonly type: MoveType, public readonly vector: Vec2) { }

    public abstract possiblePlays(position: Vec2, board: FenBoard): Array<Vec2>;

    protected validVector(): void {
        if (this.vector.equal(0, 0)) {
            throw new Error('Movement 0:0 is not permitted!');
        }
    }

    protected validPosition(position: Vec2, board: FenBoard): void {
        if (ChessHelper.isOutOfBoard(position)
            || ChessHelper.getFenPiece(board, position) === FenPiece.EMPTY) {
            throw Error('The movement origin have to be valid.');
        }
    }
}
