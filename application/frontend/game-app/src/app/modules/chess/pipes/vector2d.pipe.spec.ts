import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { Vector2dPipe } from './vector2d.pipe';
import { describe, test, expect } from 'vitest';

describe('Vector2dPipe', () => {
    test('create an instance', () => {
        const pipe: Vector2dPipe = new Vector2dPipe();
        expect(pipe).toBeTruthy();
    });

    test('return a Vec2 with the given coordinate', () => {
        const pipe: Vector2dPipe = new Vector2dPipe();
        const result: Vec2 = pipe.transform([1, 2]);
        expect(result.equal(1, 2)).toBeTruthy();
    });
});
