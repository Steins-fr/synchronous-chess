import Piece, { PieceType, PieceColor } from '../piece';

export default class King extends Piece {

    public constructor(color: PieceColor) {
        super(color, PieceType.KING);
    }
}
