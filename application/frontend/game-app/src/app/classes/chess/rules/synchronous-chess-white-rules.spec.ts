import SynchronousChessWhiteRules from './synchronous-chess-white-rules';
import Piece, { PieceType, FenPiece } from '../piece/piece';
import Move from '../moves/move';
import { FenBoard } from 'src/app/helpers/chess-helper';
import Vec2 from 'vec2';

describe('SynchronousChessWhiteRules', () => {
    it('should create an instance', () => {
        expect(new SynchronousChessWhiteRules()).toBeTruthy();
    });

    it('should get pieces movements', () => {
        // Given
        const rules: SynchronousChessWhiteRules = new SynchronousChessWhiteRules();

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

    it('should get pieces possible plays', () => {
        // Given
        const rules: SynchronousChessWhiteRules = new SynchronousChessWhiteRules();

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
