import ChessRules from './chess-rules';
import Move from '../moves/move';
import LinearMove from '../moves/linear-move';
import HopMove from '../moves/hop-move';
import DestinationColorMoveCondition from '../moves/move-conditions/destination-color-move-condition';
import LineMoveCondition from '../moves/move-conditions/line-move-condition';
import CaseMoveCondition from '../moves/move-conditions/case-move-condition';
import { FenPiece, PieceColor } from '../piece/piece';
import { Line } from 'src/app/helpers/chess-helper';
import { DoNotApprocheMoveCondition } from '../moves/move-conditions/do-not-approche-move-condition';

export default class SynchronousChessRules extends ChessRules {

    public readonly direction: number;

    public constructor(color: PieceColor) {
        super(color);
        this.direction = this.isBlack() ? 1 : -1;

        this.pawnMove = [
            HopMove.build([0, 1 * this.direction], [
                new DestinationColorMoveCondition(PieceColor.NONE)
            ]),
            HopMove.build([0, 2 * this.direction], [
                new LineMoveCondition(this.isBlack() ? Line._7 : Line._2),
                new CaseMoveCondition([0, 1 * this.direction], [FenPiece.EMPTY])
            ]),
            ...HopMove.buildAll([[-1, 1 * this.direction], [1, 1 * this.direction]], [
                new DestinationColorMoveCondition(this.isBlack() ? PieceColor.WHITE : PieceColor.BLACK)
            ])
        ];

        this.kingMove = HopMove.buildAll([
            [0, 1], [0, -1], [1, 0], [-1, 0],
            [1, 1], [-1, -1], [1, -1], [-1, 1]
        ], [new DoNotApprocheMoveCondition(this.isBlack() ? FenPiece.WHITE_KING : FenPiece.BLACK_KING, 2)]);
    }

    public readonly queenMove: Array<Move> = LinearMove.buildAll([
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    ]);

    public readonly bishopMove: Array<Move> = LinearMove.buildAll([
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    ]);

    public readonly knightMove: Array<Move> = HopMove.buildAll([
        [1, 2], [2, 1],
        [-1, 2], [2, -1],
        [1, -2], [-2, 1],
        [-1, -2], [-2, -1]
    ]);

    public readonly rookMove: Array<Move> = LinearMove.buildAll([
        [0, 1], [0, -1], [1, 0], [-1, 0]
    ]);

    public readonly pawnMove: Array<Move>;
    public readonly kingMove: Array<Move>;

    public isWhite(): boolean {
        return this.color === PieceColor.WHITE;
    }

    public isBlack(): boolean {
        return this.color === PieceColor.BLACK;
    }
}
