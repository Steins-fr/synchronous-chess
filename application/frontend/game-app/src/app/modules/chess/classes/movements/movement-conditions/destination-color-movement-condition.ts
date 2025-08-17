import MovementCondition from '@app/modules/chess/classes/movements/movement-conditions/movement-condition';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import ChessBoardHelper from '@app/modules/chess/helpers/chess-board-helper';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { PieceColor } from '../../../enums/piece-color.enum';

export default class DestinationColorMovementCondition extends MovementCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPieceByVec(board, newPosition)) === this.pieceColor;
    }
}
