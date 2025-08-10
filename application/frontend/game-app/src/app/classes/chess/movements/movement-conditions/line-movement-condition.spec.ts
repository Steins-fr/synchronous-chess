import { Row } from '@app/classes/chess/interfaces/CoordinateMove';
import LineMovementCondition from '@app/classes/chess/movements/movement-conditions/line-movement-condition';
import { Vec2 } from '@app/classes/vector/vec2';
import { describe, test, expect } from 'vitest';

describe('LineMoveCondition', () => {
    test('should create an instance', () => {
        expect(new LineMovementCondition(Row._5)).toBeTruthy();
    });

    test('should say if it can move', () => {
        // Given
        const condition: LineMovementCondition = new LineMovementCondition(Row._4);

        // When
        const resultValidLine: boolean = condition.canMove(new Vec2(0, Row._4));
        const resultInvalidLine: boolean = condition.canMove(new Vec2(0, Row._6));

        // Then
        expect(resultValidLine).toBeTruthy();
        expect(resultInvalidLine).toBeFalsy();
    });
});
