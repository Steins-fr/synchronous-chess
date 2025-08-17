import {
    DoNotApproachMovementCondition
} from '@app/modules/chess/classes/movements/movement-conditions/do-not-approach-movement-condition';
import { FenPiece } from '@app/modules/chess/enums/fen-piece.enum';
import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { FenBoard } from '@app/modules/chess/types/fen-board';
import { describe, test, expect } from 'vitest';

describe('DoNotApproachMoveCondition', () => {
    test('should create an instance', () => {
        expect(new DoNotApproachMovementCondition(FenPiece.BLACK_KING, 2)).toBeTruthy();
    });

    test('should say if it can move', () => {
        // Given
        const condition: DoNotApproachMovementCondition = new DoNotApproachMovementCondition(FenPiece.BLACK_KING, 2);
        const board: FenBoard = [
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.BLACK_KING, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY],
            [FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY, FenPiece.EMPTY]
        ];

        // When
        const resultValidDistance: boolean = condition.canMove(new Vec2(0, 0), new Vec2(0, 5), board);
        const resultInvalidDistance: boolean = condition.canMove(new Vec2(0, 0), new Vec2(1, 1), board);

        // Then
        expect(resultValidDistance).toBeTruthy();
        expect(resultInvalidDistance).toBeFalsy();
    });
});
