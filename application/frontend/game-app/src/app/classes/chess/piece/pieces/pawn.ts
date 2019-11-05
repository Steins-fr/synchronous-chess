import Piece, { PieceColor, PieceType } from '../piece';

export default class Pawn extends Piece {
    public constructor(color: PieceColor) {
        super(color, PieceType.PAWN);
    }
}
