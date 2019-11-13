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
import { SafeMoveCondition } from '../moves/move-conditions/safe-move-condition';

export default class SynchronousChessRules extends ChessRules {

    public static readonly whiteRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);
    public static readonly blackRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);
    private static readonly whiteNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE, true);
    private static readonly blackNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK, true);

    private constructor(color: PieceColor, private readonly isForCheckSafety: boolean = false) {
        super(color);
        const direction: number = this.isBlack() ? 1 : -1;

        this.pawnMove = [
            HopMove.build([0, 1 * direction], [
                new DestinationColorMoveCondition(PieceColor.NONE)
            ]),
            HopMove.build([0, 2 * direction], [
                new LineMoveCondition(this.isBlack() ? Line._7 : Line._2),
                new CaseMoveCondition([0, 1 * direction], [FenPiece.EMPTY]),
                new CaseMoveCondition([0, 2 * direction], [FenPiece.EMPTY]),
            ]),
            ...HopMove.buildAll([[-1, 1 * direction], [1, 1 * direction]], [
                new DestinationColorMoveCondition(this.isBlack() ? PieceColor.WHITE : PieceColor.BLACK)
            ])
        ];
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

    private castlingMove(opponentRules: ChessRules): Array<Move> {
        const castlingMoves: Array<Move> = [];

        if (this.isForCheckSafety) {
            return castlingMoves;
        }

        if (this.castlingH === true) {
            castlingMoves.push(HopMove.build([2, 0], [
                new CaseMoveCondition([1, 0], [FenPiece.EMPTY]),
                new SafeMoveCondition(opponentRules, this.isForCheckSafety, [1, 0])
            ]));
        }
        if (this.castlingA === true) {
            castlingMoves.push(HopMove.build([-2, 0], [
                new CaseMoveCondition([-1, 0], [FenPiece.EMPTY]),
                new SafeMoveCondition(opponentRules, this.isForCheckSafety, [-1, 0])
            ]));
        }
        return castlingMoves;
    }

    public get kingMove(): Array<Move> {
        const opponentRules: ChessRules = this.isBlack() ? SynchronousChessRules.whiteNoSafetyRules : SynchronousChessRules.blackNoSafetyRules;

        return [
            ...HopMove.buildAll([
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [-1, -1], [1, -1], [-1, 1]
            ], [
                new DoNotApprocheMoveCondition(this.isBlack() ? FenPiece.WHITE_KING : FenPiece.BLACK_KING, 2),
                new SafeMoveCondition(opponentRules, this.isForCheckSafety)
            ]),
            ...this.castlingMove(opponentRules)
        ];
    }

    public isWhite(): boolean {
        return this.color === PieceColor.WHITE;
    }

    public isBlack(): boolean {
        return this.color === PieceColor.BLACK;
    }
}
