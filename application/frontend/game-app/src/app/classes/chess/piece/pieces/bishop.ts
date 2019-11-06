import Piece, { PieceColor, PieceType } from '../piece';
import LinearMove from '../../moves/linear-move';

export default class Bishop extends Piece {

    public readonly moves: Array<LinearMove> = LinearMove.build(
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    );

    public constructor(color: PieceColor) {
        super(color, PieceType.BISHOP);
    }
}
