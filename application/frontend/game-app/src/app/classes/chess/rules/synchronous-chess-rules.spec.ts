import Movement from '@app/classes/chess/movements/movement';
import { PieceColor, PieceType, FenPiece } from '@app/classes/chess/rules/chess-rules';
import SynchronousChessRules from '@app/classes/chess/rules/synchronous-chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/helpers/chess-board-helper';
import { describe, test, expect } from 'vitest';

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

    test('should get pieces movements', () => {
        // Given
        const rules: SynchronousChessRules = new SynchronousChessRules(PieceColor.BLACK);

        // When
        const queenMovements: Array<Movement> = rules.getPieceMovements(PieceType.QUEEN);
        const kingMovements: Array<Movement> = rules.getPieceMovements(PieceType.KING);
        const bishopMovements: Array<Movement> = rules.getPieceMovements(PieceType.BISHOP);
        const knightMovements: Array<Movement> = rules.getPieceMovements(PieceType.KNIGHT);
        const rookMovements: Array<Movement> = rules.getPieceMovements(PieceType.ROOK);
        const pawnMovements: Array<Movement> = rules.getPieceMovements(PieceType.PAWN);

        // Then
        expect(queenMovements).toEqual(rules['queenMovement']);
        expect(kingMovements).toEqual(rules['kingMovement']);
        expect(bishopMovements).toEqual(rules['bishopMovement']);
        expect(knightMovements).toEqual(rules['knightMovement']);
        expect(rookMovements).toEqual(rules['rookMovement']);
        expect(pawnMovements).toEqual(rules['pawnMovement']);
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
