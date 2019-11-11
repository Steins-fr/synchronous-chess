import Piece, { PieceColor, PieceType } from '../piece';

export default class Rook extends Piece {

    public constructor(color: PieceColor) {
        super(color, PieceType.ROOK);
    }
}
