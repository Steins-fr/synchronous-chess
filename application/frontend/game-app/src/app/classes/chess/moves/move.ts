import Vec2 from 'vec2';
import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import MoveCondition from './move-conditions/move-condition';
import { FenPiece } from '../rules/chess-rules';

export enum MoveType {
    LINEAR = 'linear',
    HOP = 'hop',
    DOUBLE_HOP = 'double-hop',
    FEAR_HOP = 'fear-hop'
}

export default abstract class Move {
    public constructor(public readonly type: MoveType, public readonly vector: Vec2, public readonly conditions: Array<MoveCondition>) { }

    protected abstract _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2>;

    protected validVector(): void {
        if (this.vector.equal(0, 0)) {
            throw new Error('Movement 0:0 is not permitted!');
        }
    }

    protected validPosition(position: Vec2, board: FenBoard): void {
        if (ChessBoardHelper.isOutOfBoard(position)
            || ChessBoardHelper.getFenPiece(board, position) === FenPiece.EMPTY) {
            throw Error('The movement origin have to be valid.');
        }
    }

    public possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        const possiblePlays: Array<Vec2> = this._possiblePlays(position, board);
        if (this.conditions.length > 0) {
            return possiblePlays.filter((newPosition: Vec2) =>
                this.conditions.every((condition: MoveCondition) => condition.canMove(position, newPosition, board))
            );
        }
        return possiblePlays;
    }
}
