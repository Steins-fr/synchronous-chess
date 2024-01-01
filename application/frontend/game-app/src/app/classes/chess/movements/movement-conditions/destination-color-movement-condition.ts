import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { PieceColor } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper, { FenBoard } from '@app/helpers/chess-board-helper';

export default class DestinationColorMovementCondition extends MovementCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) === this.pieceColor;
    }
}
