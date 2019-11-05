import Piece, { PieceColor, PieceType } from '../piece';

export default class Bishop extends Piece {
    public constructor(color: PieceColor) {
        super(color, PieceType.BISHOP);
    }
}
