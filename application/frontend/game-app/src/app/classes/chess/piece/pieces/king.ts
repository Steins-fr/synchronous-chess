import Piece, { PieceType, PieceColor, FenPiece } from '../piece';
import FearHopMove from '../../moves/fear-hop-move';

export default class King extends Piece {

    public readonly moves: Array<FearHopMove>;

    public constructor(color: PieceColor) {
        super(color, PieceType.KING);

        const dontApproche: FenPiece = color === PieceColor.BLACK ? FenPiece.WHITE_KING : FenPiece.BLACK_KING;

        this.moves = FearHopMove.build(
            { vector: [0, 1], dontApproche }, { vector: [0, -1], dontApproche },
            { vector: [1, 0], dontApproche }, { vector: [-1, 0], dontApproche },
            { vector: [1, 1], dontApproche }, { vector: [-1, -1], dontApproche },
            { vector: [1, -1], dontApproche }, { vector: [-1, 1], dontApproche }
        );
    }
}
