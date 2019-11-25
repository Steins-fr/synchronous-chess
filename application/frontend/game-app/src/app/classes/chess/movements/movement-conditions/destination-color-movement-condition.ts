import Vec2 from 'vec2';
import { PieceColor } from '../../rules/chess-rules';
import ChessBoardHelper, { FenBoard } from '../../../../helpers/chess-board-helper';
import MovementCondition from './movement-condition';

export default class DestinationColorMovementCondition extends MovementCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) === this.pieceColor;
    }
}
