import LineMoveCondition from './line-move-condition';
import Vec2 from 'vec2';
import { Line } from 'src/app/helpers/chess-helper';


describe('LineMoveCondition', () => {
    it('should create an instance', () => {
        expect(new LineMoveCondition(Line._5)).toBeTruthy();
    });

    it('should say if it can move', () => {
        // Given
        const condition: LineMoveCondition = new LineMoveCondition(Line._4);

        // When
        const resultValidLine: boolean = condition.canMove(new Vec2([0, Line._4]));
        const resultInvalidLine: boolean = condition.canMove(new Vec2([0, Line._6]));

        // Then
        expect(resultValidLine).toBeTruthy();
        expect(resultInvalidLine).toBeFalsy();
    });
});
