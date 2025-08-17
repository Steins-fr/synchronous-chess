import { SafeMovementCondition } from '@app/modules/chess/classes/movements/movement-conditions/safe-movement-condition';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { PieceColor } from '@app/modules/chess/enums/piece-color.enum';
import SynchronousChessRules from '@app/modules/chess/classes/rules/synchronous-chess-rules';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { describe, test, expect } from 'vitest';

describe('SafeMoveCondition', () => {
    test('should say if it can move', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), false);
        const board: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(3, 0), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(5, 0), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });

    test('should say if it can move without safety', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), true);
        const board: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidKingSafety1: boolean = condition.canMove(new Vec2(4, 0), new Vec2(3, 0), board);
        const resultValidKingSafety2: boolean = condition.canMove(new Vec2(4, 0), new Vec2(5, 0), board);

        // Then
        expect(resultValidKingSafety1).toBeTruthy();
        expect(resultValidKingSafety2).toBeTruthy();
    });

    test('should say if it can move (with cell condition safety)', () => {
        // Given
        const condition: SafeMovementCondition = new SafeMovementCondition(new SynchronousChessRules(PieceColor.BLACK), false, [1, 0]);
        const board: FenBoard = [
            [FenPiece.WHITE_ROOK, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_ROOK],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.WHITE_KING],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_QUEEN, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidKingSafety: boolean = condition.canMove(new Vec2(7, 1), new Vec2(7, 2), board);
        const resultInvalidKingSafety: boolean = condition.canMove(new Vec2(4, 0), new Vec2(6, 0), board);

        // Then
        expect(resultValidKingSafety).toBeTruthy();
        expect(resultInvalidKingSafety).toBeFalsy();
    });
});
