import Piece, { PieceColor, PieceType } from '../piece';

export default class Queen extends Piece {

    public constructor(color: PieceColor) {
        super(color, PieceType.QUEEN);
    }
}
