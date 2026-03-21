import MovementCondition from '@app/modules/chess/classes/movements/movement-conditions/movement-condition';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';

export enum MovementType {
    LINEAR = 'linear',
    HOP = 'hop',
    // FIXME: why is this not used?
    DOUBLE_HOP = 'double-hop',
    FEAR_HOP = 'fear-hop'
}

export default abstract class Movement {
    protected constructor(
        public readonly type: MovementType,
        public readonly vector: Vec2,
        public readonly conditions: Array<MovementCondition>
    ) { }

    protected abstract _possiblePlays(position: Vec2, board: FenBoard): Array<Vec2>;

    protected validVector(): void {
        if (this.vector.equal(0, 0)) {
            throw new Error('Movement 0:0 is not permitted!');
        }
    }

    protected validPosition(position: Vec2, board: FenBoard): void {
        if (ChessBoardHelper.isOutOfBoardByVec(position)
            || ChessBoardHelper.getFenPieceByVec(board, position) === FenPiece.EMPTY) {
            throw Error('The movement origin have to be valid.');
        }
    }

    public possiblePlays(position: Vec2, board: FenBoard): Array<Vec2> {
        const possiblePlays: Array<Vec2> = this._possiblePlays(position, board);
        if (this.conditions.length > 0) {
            return possiblePlays.filter((newPosition: Vec2) =>
                this.conditions.every((condition: MovementCondition) => condition.canMove(position, newPosition, board))
            );
        }
        return possiblePlays;
    }
}
