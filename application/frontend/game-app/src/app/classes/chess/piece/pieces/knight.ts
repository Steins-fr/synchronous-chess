import Piece, { PieceColor, PieceType } from '../piece';
import HopMove from '../../moves/hop-move';

export default class Knight extends Piece {

    public readonly moves: Array<HopMove> = HopMove.build(
        [1, 2], [2, 1],
        [-1, 2], [2, -1],
        [1, -2], [-2, 1],
        [-1, -2], [-2, -1]
    );

    public constructor(color: PieceColor) {
        super(color, PieceType.KNIGHT);
    }
}
