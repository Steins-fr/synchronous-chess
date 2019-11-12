import SynchronousChessRules from './synchronous-chess-rules';
import Move from '../moves/move';
import FearHopMove from '../moves/fear-hop-move';
import { FenPiece, PieceColor } from '../piece/piece';
import { Line } from 'src/app/helpers/chess-helper';
import HopMove from '../moves/hop-move';
import LineMoveCondition from '../moves/move-conditions/line-move-condition';
import CaseMoveCondition from '../moves/move-conditions/case-move-condition';
import DestinationColorMoveCondition from '../moves/move-conditions/destination-color-move-condition';

export default class SynchronousChessBlackRules extends SynchronousChessRules {

    public readonly kingMove: Array<Move> = FearHopMove.build(
        { vector: [0, 1], dontApproche: FenPiece.WHITE_KING }, { vector: [0, -1], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, 0], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, 0], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, 1], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, -1], dontApproche: FenPiece.WHITE_KING },
        { vector: [1, -1], dontApproche: FenPiece.WHITE_KING }, { vector: [-1, 1], dontApproche: FenPiece.WHITE_KING }
    );

    public readonly pawnMove: Array<Move> = [
        HopMove.build([0, 1], [
            new DestinationColorMoveCondition(PieceColor.NONE)
        ]),
        HopMove.build([0, 2], [
            new LineMoveCondition(Line._7),
            new CaseMoveCondition([0, 1], [FenPiece.EMPTY])
        ]),
        ...HopMove.buildAll([[-1, 1], [1, 1]], [
            new DestinationColorMoveCondition(PieceColor.WHITE)
        ])
    ];
}
