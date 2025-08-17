import ChessRules from './chess-rules';
import LinearMovement from '../movements/linear-movement';
import HopMovement from '../movements/hop-movement';
import DestinationColorMovementCondition from '../movements/movement-conditions/destination-color-movement-condition';
import LineMovementCondition from '../movements/movement-conditions/line-movement-condition';
import CaseMovementCondition from '../movements/movement-conditions/case-movement-condition';
import { DoNotApproachMovementCondition } from '../movements/movement-conditions/do-not-approach-movement-condition';
import { SafeMovementCondition } from '../movements/movement-conditions/safe-movement-condition';
import Movement from '../movements/movement';
import { Row } from '../interfaces/CoordinateMove';
import ChessBoardHelper from '../../../helpers/chess-board-helper';
import { FenBoard } from '@app/classes/chess/types/fen-board';
import { SafeBoard } from '@app/classes/chess/types/safe-board';
import { FenCoordinate } from '../interfaces/move';
import { FenPiece } from '../enums/fen-piece.enum';
import { PieceColor } from '../enums/piece-color.enum';
import { PieceType } from '../enums/piece-type.enum';

export default class SynchronousChessRules extends ChessRules {

    private static readonly whiteNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE, true, false, false);
    private static readonly blackNoSafetyRules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK, true, false, false);

    protected pieceMovement: Record<PieceType, ReadonlyArray<Movement>>;

    public constructor(
        color: PieceColor,
        private readonly isForCheckSafety: boolean = false,
        isQueenSideCastleAvailable: boolean = true,
        isKingSideCastleAvailable: boolean = true
    ) {
        super(color, isQueenSideCastleAvailable, isKingSideCastleAvailable);

        this.pieceMovement = SynchronousChessRules.generatePieceMovement(this.isBlack(), isQueenSideCastleAvailable, isKingSideCastleAvailable, this.isForCheckSafety);
    }

    protected updatePieceMovement(isQueenSideCastleAvailable: boolean, isKingSideCastleAvailable: boolean): void {
        this.pieceMovement = SynchronousChessRules.generatePieceMovement(this.isBlack(), isQueenSideCastleAvailable, isKingSideCastleAvailable, this.isForCheckSafety);
    }

    private static generatePieceMovement(
        isBlack: boolean,
        isQueenSideCastleAvailable: boolean,
        isKingSideCastleAvailable: boolean,
        isForCheckSafety: boolean,
    ): Record<PieceType, ReadonlyArray<Movement>> {
        const pawnDirection: number = isBlack ? 1 : -1;
        const opponentRules: ChessRules = isBlack ? SynchronousChessRules.whiteNoSafetyRules : SynchronousChessRules.blackNoSafetyRules;

        const castlingMoves: Array<Movement> = [];

        if (isKingSideCastleAvailable) {
            castlingMoves.push(HopMovement.build([2, 0], [
                new CaseMovementCondition([1, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([2, 0], [FenPiece.EMPTY]),
                new SafeMovementCondition(opponentRules, isForCheckSafety, [1, 0])
            ]));
        }
        if (isQueenSideCastleAvailable) {
            castlingMoves.push(HopMovement.build([-2, 0], [
                new CaseMovementCondition([-1, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([-2, 0], [FenPiece.EMPTY]),
                new CaseMovementCondition([-3, 0], [FenPiece.EMPTY]),
                new SafeMovementCondition(opponentRules, isForCheckSafety, [-1, 0])
            ]));
        }


        return {
            [PieceType.KING]: [
                ...HopMovement.buildAll([
                    [0, 1], [0, -1], [1, 0], [-1, 0],
                    [1, 1], [-1, -1], [1, -1], [-1, 1]
                ], [
                    new DoNotApproachMovementCondition(isBlack ? FenPiece.WHITE_KING : FenPiece.BLACK_KING, 2),
                    new SafeMovementCondition(opponentRules, isForCheckSafety)
                ]),
                ...castlingMoves
            ],
            [PieceType.QUEEN]: LinearMovement.buildAll([
                [0, 1], [0, -1], [1, 0], [-1, 0],
                [1, 1], [-1, -1], [1, -1], [-1, 1]
            ]),
            [PieceType.BISHOP]: LinearMovement.buildAll([
                [1, 1], [-1, -1], [1, -1], [-1, 1]
            ]),
            [PieceType.KNIGHT]: HopMovement.buildAll([
                [1, 2], [2, 1],
                [-1, 2], [2, -1],
                [1, -2], [-2, 1],
                [-1, -2], [-2, -1]
            ]),
            [PieceType.ROOK]: LinearMovement.buildAll([
                [0, 1], [0, -1], [1, 0], [-1, 0]
            ]),
            [PieceType.PAWN]: [
                HopMovement.build([0, pawnDirection], [
                    new DestinationColorMovementCondition(PieceColor.NONE)
                ]),
                HopMovement.build([0, 2 * pawnDirection], [
                    new LineMovementCondition(isBlack ? Row._7 : Row._2),
                    new CaseMovementCondition([0, pawnDirection], [FenPiece.EMPTY]),
                    new CaseMovementCondition([0, 2 * pawnDirection], [FenPiece.EMPTY]),
                ]),
                ...HopMovement.buildAll([[-1, pawnDirection], [1, pawnDirection]], [
                    new DestinationColorMovementCondition(isBlack ? PieceColor.WHITE : PieceColor.BLACK)
                ])
            ],
            [PieceType.NONE]: []
        };
    }

    public getSafeBoard(board: FenBoard, excludeFrom?: FenCoordinate): SafeBoard {
        const opponentRules: ChessRules = this.isBlack() ? SynchronousChessRules.whiteNoSafetyRules : SynchronousChessRules.blackNoSafetyRules;
        return ChessBoardHelper.fenBoardToSafeBoard(board, opponentRules, excludeFrom);
    }
}
