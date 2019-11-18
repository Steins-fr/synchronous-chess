import Vec2 from 'vec2';
import { PieceColor } from '../../rules/chess-rules';
import ChessBoardHelper, { FenBoard } from 'src/app/helpers/chess-board-helper';
import MoveCondition from './move-condition';

export default class DestinationColorMoveCondition extends MoveCondition {

    public constructor(public readonly pieceColor: PieceColor) {
        super();
    }

    public canMove(_oldPosition: Vec2, newPosition: Vec2, board: FenBoard): boolean {
        return ChessBoardHelper.pieceColor(ChessBoardHelper.getFenPiece(board, newPosition)) === this.pieceColor;
    }
}
