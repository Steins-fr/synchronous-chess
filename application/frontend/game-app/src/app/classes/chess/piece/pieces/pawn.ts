import Piece, { PieceColor, PieceType } from '../piece';
import HopMove from '../../moves/hop-move';

export default class Pawn extends Piece {

    public readonly moves: Array<HopMove>;

    public constructor(color: PieceColor) {
        super(color, PieceType.PAWN);
        const verticalDirection: number = color === PieceColor.BLACK ? 1 : -1;
        this.moves = HopMove.build(
            [0, 1 * verticalDirection]
        );
    }
}
