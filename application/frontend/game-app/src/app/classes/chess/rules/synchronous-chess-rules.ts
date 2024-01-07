import ChessRules, { PieceColor, FenPiece, PieceType } from './chess-rules';
import LinearMove from '../movements/linear-movement';
import HopMove from '../movements/hop-movement';
import DestinationColorMovementCondition from '../movements/movement-conditions/destination-color-movement-condition';
import LineMovementCondition from '../movements/movement-conditions/line-movement-condition';
import CaseMovementCondition from '../movements/movement-conditions/case-movement-condition';
import { DoNotApproachMovementCondition } from '../movements/movement-conditions/do-not-approach-movement-condition';
import { SafeMovementCondition } from '../movements/movement-conditions/safe-movement-condition';
import Movement from '../movements/movement';
import { Row } from '../interfaces/CoordinateMove';
import ChessBoardHelper, { FenBoard, SafeBoard } from '../../../helpers/chess-board-helper';
import { FenCoordinate } from '../interfaces/move';

// TODO: rewrite all this file
export default class SynchronousChessRules extends ChessRules {

    private static readonly whiteNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE, true, false, false);
    private static readonly blackNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK, true, false, false);

    protected readonly pieceMovement: Record<PieceType, () => Array<Movement>> = {
        [PieceType.KING]: () => this.kingMovement,
        [PieceType.QUEEN]: () => this.queenMovement,
        [PieceType.BISHOP]: () => this.bishopMovement,
        [PieceType.KNIGHT]: () => this.knightMovement,
        [PieceType.ROOK]: () => this.rookMovement,
        [PieceType.PAWN]: () => this.pawnMovement,
        [PieceType.NONE]: () => []
    };

    public constructor(color: PieceColor,
        private readonly isForCheckSafety: boolean = false,
        isQueenSideCastleAvailable: boolean = true,
        isKingSideCastleAvailable: boolean = true) {
        super(color, isQueenSideCastleAvailable, isKingSideCastleAvailable);
        const direction: number = this.isBlack() ? 1 : -1;

        this.pawnMovement = [
            HopMove.build([0, direction], [
                new DestinationColorMovementCondition(PieceColor.NONE)
            ]),
            HopMove.build([0, 2 * direction], [
                new LineMovementCondition(this.isBlack() ? Row._7 : Row._2),
                new CaseMovementCondition([0, direction], [FenPiece.EMPTY]),
                new CaseMovementCondition([0, 2 * direction], [FenPiece.EMPTY]),
            ]),
            ...HopMove.buildAll([[-1, direction], [1, direction]], [
                new DestinationColorMovementCondition(this.isBlack() ? PieceColor.WHITE : PieceColor.BLACK)
            ])
        ];
    }

    private readonly queenMovement: Array<Movement> = LinearMove.buildAll([
        [0, 1], [0, -1], [1, 0], [-1, 0],
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    ]);

    private readonly bishopMovement: Array<Movement> = LinearMove.buildAll([
        [1, 1], [-1, -1], [1, -1], [-1, 1]
    ]);

    private readonly knightMovement: Array<Movement> = HopMove.buildAll([
        [1, 2], [2, 1],
        [-1, 2], [2, -1],
        [1, -2], [-2, 1],
        [-1, -2], [-2, -1]
    ]);

    private readonly rookMovement: Array<Movement> = LinearMove.buildAll([
        [0, 1], [0, -1], [1, 0], [-1, 0]
    ]);

    private readonly pawnMovement: Array<Movement>;

    private castlingMovement(opponentRules: ChessRules): Array<Movement> {
        const castlingMoves: Array<Movement> = [];

        if (this.isKingSideCastleAvailable) {
            castlingMoves.push(HopMove.build([2, 0], [
                new CaseMovementCondition([1, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([2, 0], [FenPiece.EMPTY]),
                new SafeMovementCondition(opponentRules, this.isForCheckSafety, [1, 0])
            ]));
        }
        if (this.isQueenSideCastleAvailable) {
            castlingMoves.push(HopMove.build([-2, 0], [
                new CaseMovementCondition([-1, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([-2, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([-3, 0], [FenPiece.EMPTY]),
                new SafeMovementCondition(opponentRules, this.isForCheckSafety, [-1, 0])
            ]));
        }
        return castlingMoves;
    }

    private get kingMovement(): Array<Movement> {
        const opponentRules: ChessRules = this.isBlack() ? SynchronousChessRules.whiteNoSafetyRules : SynchronousChessRules.blackNoSafetyRules;

        return [
            ...HopMove.buildAll([
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [-1, -1], [1, -1], [-1, 1]
            ], [
                new DoNotApproachMovementCondition(this.isBlack() ? FenPiece.WHITE_KING : FenPiece.BLACK_KING, 2),
                new SafeMovementCondition(opponentRules, this.isForCheckSafety)
            ]),
            ...this.castlingMovement(opponentRules)
        ];
    }

    public getSafeBoard(board: FenBoard, excludeFrom?: FenCoordinate): SafeBoard {
        const opponentRules: ChessRules = this.isBlack() ? SynchronousChessRules.whiteNoSafetyRules : SynchronousChessRules.blackNoSafetyRules;
        return ChessBoardHelper.fenBoardToSafeBoard(board, opponentRules, excludeFrom);
    }
}
