import SynchronousChessRules from './synchronous-chess-rules';
import Move from '../moves/move';
import HopMove from '../moves/hop-move';
import FearHopMove from '../moves/fear-hop-move';
import { FenPiece } from '../piece/piece';

export default class SynchronousChessBlackRules extends SynchronousChessRules {

    public readonly kingMove: Array<Move> = FearHopMove.build(
        { vector: [0, 1], dontApproche: FenPiece.WHITE_KING }, { vector: [0, -1], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, 0], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, 0], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, 1], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, -1], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, -1], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, 1], dontApproche: FenPiece.WHITE_KING }
    );

    public readonly pawnMove: Array<Move> = HopMove.build(
        [0, 1]
    );
}
