import Piece, { PieceColor, PieceType } from '../piece';
import LinearMove from '../../moves/linear-move';

export default class Rook extends Piece {


    public readonly moves: Array<LinearMove> = LinearMove.build(
        [0, 1], [0, -1], [1, 0], [-1, 0]
    );

    public constructor(color: PieceColor) {
        super(color, PieceType.ROOK);
    }
}
