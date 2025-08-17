import MovementCondition from '@app/classes/chess/movements/movement-conditions/movement-condition';
import { Vec2 } from '@app/classes/vector/vec2';
import ChessBoardHelper from '@app/helpers/chess-board-helper';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { PieceColor } from '../../enums/piece-color.enum';

export default class DestinationColorMovementCondition extends MovementCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) === this.pieceColor;
    }
}
