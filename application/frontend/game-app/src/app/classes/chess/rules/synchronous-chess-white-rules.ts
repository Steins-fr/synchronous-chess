import SynchronousChessRules from './synchronous-chess-rules';
import Move from '../moves/move';
import FearHopMove from '../moves/fear-hop-move';
import { FenPiece, PieceColor } from '../piece/piece';
import { Line } from 'src/app/helpers/chess-helper';
import HopMove from '../moves/hop-move';
import ConditionalMove from '../moves/conditional-move';
import LineMoveCondition from '../moves/move-conditions/line-move-condition';
import CaseMoveCondition from '../moves/move-conditions/case-move-condition';
import DestinationColorMoveCondition from '../moves/move-conditions/destination-color-move-condition';

export default class SynchronousChessWhiteRules extends SynchronousChessRules {

    public readonly kingMove: Array<Move> = FearHopMove.build(
        { vector: [0, 1], dontApproche: FenPiece.BLACK_KING }, { vector: [0, -1], dontApproche: FenPiece.BLACK_KING },
        { vector: [1, 0], dontApproche: FenPiece.BLACK_KING }, { vector: [-1, 0], dontApproche: FenPiece.BLACK_KING },
        { vector: [1, 1], dontApproche: FenPiece.BLACK_KING }, { vector: [-1, -1], dontApproche: FenPiece.BLACK_KING },
        { vector: [1, -1], dontApproche: FenPiece.BLACK_KING }, { vector: [-1, 1], dontApproche: FenPiece.BLACK_KING }
    );

    public readonly pawnMove: Array<Move> = [
        ...HopMove.build([0, -1]).map((move: HopMove) =>
            ConditionalMove.buildOne({
                move, conditions: [
                    new DestinationColorMoveCondition(PieceColor.NONE)
                ]
            })
        ),
        ...HopMove.build([0, -2]).map((move: HopMove) =>
            ConditionalMove.buildOne({
                move, conditions: [
                    new LineMoveCondition(Line._2),
                    new CaseMoveCondition(move.vector.add(0, 1, true), [FenPiece.EMPTY])
                ]
            })
        ),
        ...HopMove.build([-1, -1], [1, -1]).map((move: HopMove) =>
            ConditionalMove.buildOne({
                move, conditions: [
                    new DestinationColorMoveCondition(PieceColor.BLACK)
                ]
            })
        )
    ];
}
