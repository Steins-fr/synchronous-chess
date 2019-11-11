import Piece, { PieceColor, PieceType } from '../piece';

export default class Knight extends Piece {

    public constructor(color: PieceColor) {
        super(color, PieceType.KNIGHT);
    }
}
