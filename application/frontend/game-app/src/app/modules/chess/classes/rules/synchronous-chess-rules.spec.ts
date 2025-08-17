import SynchronousChessRules from '@app/modules/chess/classes/rules/synchronous-chess-rules';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { describe, expect, test } from 'vitest';
import { FenPiece } from '../../enums/fen-piece.enum';
import { PieceColor } from '../../enums/piece-color.enum';
import { PieceType } from '../../enums/piece-type.enum';

describe('SynchronousChessRules', () => {
    test('should get the rules for a specific color', () => {
        // Given
        const blackColor: PieceColor = PieceColor.BLACK;
        const whiteColor: PieceColor = PieceColor.WHITE;

        // When
        const rulesBlack: SynchronousChessRules = new SynchronousChessRules(blackColor);
        const rulesWhite: SynchronousChessRules = new SynchronousChessRules(whiteColor);

        // Then
        expect(rulesBlack.color).toEqual(blackColor);
        expect(rulesWhite.color).toEqual(whiteColor);
    });

    describe('should get pieces movements', () => {
        test('For black pieces', () => {
            const rules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);

            const queenMovements = rules.getPieceMovements(PieceType.QUEEN);
            const kingMovements = rules.getPieceMovements(PieceType.KING);
            const bishopMovements = rules.getPieceMovements(PieceType.BISHOP);
            const knightMovements = rules.getPieceMovements(PieceType.KNIGHT);
            const rookMovements = rules.getPieceMovements(PieceType.ROOK);
            const pawnMovements = rules.getPieceMovements(PieceType.PAWN);

            expect(queenMovements).toHaveLength(8);
            expect(kingMovements).toHaveLength(10);
            expect(bishopMovements).toHaveLength(4);
            expect(knightMovements).toHaveLength(8);
            expect(rookMovements).toHaveLength(4);
            expect(pawnMovements).toHaveLength(4);
        });
    });

    test('should tell is the rules are for blacks or whites', () => {
        // Given
        const rulesBlack: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);
        const rulesWhite: SynchronousChessRules = new SynchronousChessRules(PieceColor.WHITE);

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

    test('should get pieces possible plays', () => {
        // Given
        const rules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);

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
