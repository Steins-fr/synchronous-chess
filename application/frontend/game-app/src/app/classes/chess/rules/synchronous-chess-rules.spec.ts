import SynchronousChessRules from './synchronous-chess-rules';
import { PieceType, FenPiece, PieceColor } from '../piece/piece';
import Move from '../moves/move';
import Vec2 from 'vec2';
import { FenBoard } from 'src/app/helpers/chess-board-helper';

describe('SynchronousChessRules', () => {
    it('should create an instance', () => {
        expect(SynchronousChessRules.getRules(PieceColor.BLACK)).toBeTruthy();
    });

    it('should get the rules for a specific color', () => {
        // Given
        const blackColor: PieceColor = PieceColor.BLACK;
        const whiteColor: PieceColor = PieceColor.WHITE;

        // When
        const rulesBlack: SynchronousChessRules = SynchronousChessRules.getRules(blackColor);
        const rulesWhite: SynchronousChessRules = SynchronousChessRules.getRules(whiteColor);

        // Then
        expect(rulesBlack.color).toEqual(blackColor);
        expect(rulesWhite.color).toEqual(whiteColor);
    });

    it('should get pieces movements', () => {
        // Given
        const rules: SynchronousChessRules = SynchronousChessRules.getRules(PieceColor.BLACK);

        // When
        const queenMoves: Array<Move> = rules.getPieceMoves(PieceType.QUEEN);
        const kingMoves: Array<Move> = rules.getPieceMoves(PieceType.KING);
        const bishopMoves: Array<Move> = rules.getPieceMoves(PieceType.BISHOP);
        const knightMoves: Array<Move> = rules.getPieceMoves(PieceType.KNIGHT);
        const rookMoves: Array<Move> = rules.getPieceMoves(PieceType.ROOK);
        const pawnMoves: Array<Move> = rules.getPieceMoves(PieceType.PAWN);

        // Then
        expect(queenMoves).toEqual(rules.queenMove);
        expect(kingMoves).toEqual(rules.kingMove);
        expect(bishopMoves).toEqual(rules.bishopMove);
        expect(knightMoves).toEqual(rules.knightMove);
        expect(rookMoves).toEqual(rules.rookMove);
        expect(pawnMoves).toEqual(rules.pawnMove);
    });

    it('should tell is the rules are for blacks or whites', () => {
        // Given
        const rulesBlack: SynchronousChessRules = SynchronousChessRules.getRules(PieceColor.BLACK);
        const rulesWhite: SynchronousChessRules = SynchronousChessRules.getRules(PieceColor.WHITE);

        // When
        const blackIsBlack: boolean = rulesBlack.isBlack();
        const blackIsNotWhite: boolean = rulesBlack.isWhite();
        const whiteIsWhite: boolean = rulesWhite.isWhite();
        const whiteIsNotBlack: boolean = rulesWhite.isBlack();

        // Then
        expect(blackIsBlack).toBeTruthy();
        expect(blackIsNotWhite).toBeFalsy();
        expect(whiteIsWhite).toBeTruthy();
        expect(whiteIsNotBlack).toBeFalsy();
    });

    it('should get pieces possible plays', () => {
        // Given
        const rules: SynchronousChessRules = SynchronousChessRules.getRules(PieceColor.BLACK);

        const position: Vec2 = new Vec2(0, 0);

        const boardEmpty: FenBoard = [
            [FenPiece.BLACK_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];
        const boardEmptyExpectedPlays: Array<Vec2> = [
            new Vec2(0, 1), new Vec2(0, 2), new Vec2(0, 3), new Vec2(0, 4), new Vec2(0, 5), new Vec2(0, 6), new Vec2(0, 7),
            new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0), new Vec2(4, 0), new Vec2(5, 0), new Vec2(6, 0), new Vec2(7, 0)
        ];

        // When
        const boardEmptyPlays: Array<Vec2> = rules.getPossiblePlays(PieceType.ROOK, position, boardEmpty);

        // Then
        expect(boardEmptyPlays).toEqual(boardEmptyExpectedPlays);
    });
});
