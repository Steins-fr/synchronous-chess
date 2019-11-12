import SynchronousChessRules from './synchronous-chess-rules';
import Move from '../moves/move';
import { FenPiece, PieceColor } from '../piece/piece';
import { Line } from 'src/app/helpers/chess-helper';
import HopMove from '../moves/hop-move';
import LineMoveCondition from '../moves/move-conditions/line-move-condition';
import CaseMoveCondition from '../moves/move-conditions/case-move-condition';
import DestinationColorMoveCondition from '../moves/move-conditions/destination-color-move-condition';
import { DoNotApprocheMoveCondition } from '../moves/move-conditions/do-not-approche-move-condition';

export default class SynchronousChessWhiteRules extends SynchronousChessRules {

    public readonly kingMove: Array<Move> = HopMove.buildAll([
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    ], [new DoNotApprocheMoveCondition(FenPiece.BLACK_KING, 2)]);

    public readonly pawnMove: Array<Move> = [
        HopMove.build([0, -1], [
            new DestinationColorMoveCondition(PieceColor.NONE)
        ]),
        HopMove.build([0, -2], [
            new LineMoveCondition(Line._2),
            new CaseMoveCondition([0, -1], [FenPiece.EMPTY])
        ]),
        ...HopMove.buildAll([[-1, -1], [1, -1]], [
            new DestinationColorMoveCondition(PieceColor.BLACK)
        ])
    ];
}
