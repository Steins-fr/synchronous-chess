import { Vec2 } from '@app/classes/vector/vec2';
import { Vector2dPipe } from './vector2d.pipe';

describe('Vector2dPipe', () => {
    it('create an instance', () => {
        const pipe: Vector2dPipe = new Vector2dPipe();
        expect(pipe).toBeTruthy();
    });

    it('return a Vec2 with the given coordinate', () => {
        const pipe: Vector2dPipe = new Vector2dPipe();
        const result: Vec2 = pipe.transform([1, 2]);
        expect(result.equal(1, 2)).toBeTruthy();
    });
});
