import DestinationColorMovementCondition
    from '@app/classes/chess/movements/movement-conditions/destination-color-movement-condition';
import { PieceColor, FenPiece } from '@app/classes/chess/rules/chess-rules';
import { Vec2 } from '@app/classes/vector/vec2';
import { FenBoard } from '@app/helpers/chess-board-helper';
import { describe, test, expect } from 'vitest';

describe('DestinationColorMoveCondition', () => {
    test('should create an instance', () => {
        expect(new DestinationColorMovementCondition(PieceColor.BLACK)).toBeTruthy();
    });

    test('should say if it can move', () => {
        // Given
        const condition1: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.BLACK);
        const condition2: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.WHITE);
        const condition3: DestinationColorMovementCondition = new DestinationColorMovementCondition(PieceColor.NONE);

        const board: FenBoard = [
            [FenPiece.BLACK_BISHOP, FenPiece.WHITE_KING, FenPiece.EMPTY]
        ];

        // When
        const blackResult1: boolean = condition1.canMove(new Vec2(0, 0), new Vec2(0, 0), board);
        const whiteResult1: boolean = condition1.canMove(new Vec2(0, 0), new Vec2(1, 0), board);
        const noneResult1: boolean = condition1.canMove(new Vec2(0, 0), new Vec2(2, 0), board);
        const blackResult2: boolean = condition2.canMove(new Vec2(0, 0), new Vec2(0, 0), board);
        const whiteResult2: boolean = condition2.canMove(new Vec2(0, 0), new Vec2(1, 0), board);
        const noneResult2: boolean = condition2.canMove(new Vec2(0, 0), new Vec2(2, 0), board);
        const blackResult3: boolean = condition3.canMove(new Vec2(0, 0), new Vec2(0, 0), board);
        const whiteResult3: boolean = condition3.canMove(new Vec2(0, 0), new Vec2(1, 0), board);
        const noneResult3: boolean = condition3.canMove(new Vec2(0, 0), new Vec2(2, 0), board);

        // Then
        expect(blackResult1).toBeTruthy();
        expect(whiteResult1).toBeFalsy();
        expect(noneResult1).toBeFalsy();
        expect(blackResult2).toBeFalsy();
        expect(whiteResult2).toBeTruthy();
        expect(noneResult2).toBeFalsy();
        expect(blackResult3).toBeFalsy();
        expect(whiteResult3).toBeFalsy();
        expect(noneResult3).toBeTruthy();
    });
});
