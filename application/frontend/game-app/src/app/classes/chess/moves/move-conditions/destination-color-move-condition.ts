import Vec2 from 'vec2';
import { PieceColor } from '../../piece/piece';
import ChessHelper, { FenBoard } from 'src/app/helpers/chess-helper';
import MoveCondition from './move-condition';

export default class DestinationColorMoveCondition extends MoveCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessHelper.pieceColor(ChessHelper.getFenPiece(board, newPosition)) === this.pieceColor;
    }
}
