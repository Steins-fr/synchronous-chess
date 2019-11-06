import Piece, { PieceColor, PieceType } from '../piece';
import LinearMove from '../../moves/linear-move';

export default class Queen extends Piece {

    public readonly moves: Array<LinearMove> = LinearMove.build(
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    );

    public constructor(color: PieceColor) {
        super(color, PieceType.QUEEN);
    }
}
