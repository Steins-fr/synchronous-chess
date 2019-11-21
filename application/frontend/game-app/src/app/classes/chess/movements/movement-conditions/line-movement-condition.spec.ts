import LineMovementCondition from './line-movement-condition';
import Vec2 from 'vec2';
import { Row } from '../../interfaces/CoordinateMove';


describe('LineMoveCondition', () => {
    it('should create an instance', () => {
        expect(new LineMovementCondition(Row._5)).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const condition: LineMovementCondition = new LineMovementCondition(Row._4);

        // When
        const resultValidLine: boolean = condition.canMove(new Vec2([0, Row._4]));
        const resultInvalidLine: boolean = condition.canMove(new Vec2([0, Row._6]));

        // Then
        expect(resultValidLine).toBeTruthy();
        expect(resultInvalidLine).toBeFalsy();
    });
});
