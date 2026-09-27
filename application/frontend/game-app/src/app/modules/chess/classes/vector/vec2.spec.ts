import { Vec2 } from '@app/modules/chess/classes/vector/vec2';
import { describe, test, expect } from 'vitest';

describe('Vec2', () => {
    test('should create a vector from an array or another vector', () => {
        // Given
        const vec: Vec2 = new Vec2(1, 2);

        // When
        const fromArray: Vec2 = Vec2.fromArray([3, 4]);
        const fromVec: Vec2 = Vec2.fromVec(vec);

        // Then
        expect(fromArray.toArray()).toEqual([3, 4]);
        expect(fromVec.toArray()).toEqual([1, 2]);
        expect(fromVec).not.toBe(vec);
    });

    test('should apply arithmetic operations without mutating the vector', () => {
        // Given
        const vec: Vec2 = new Vec2(6, 8);
        const other: Vec2 = new Vec2(2, 4);

        // When / Then
        expect(vec.add(1, 2).toArray()).toEqual([7, 10]);
        expect(vec.addVec(other).toArray()).toEqual([8, 12]);
        expect(vec.sub(1, 2).toArray()).toEqual([5, 6]);
        expect(vec.subVec(other).toArray()).toEqual([4, 4]);
        expect(vec.mul(2, 3).toArray()).toEqual([12, 24]);
        expect(vec.mulVec(other).toArray()).toEqual([12, 32]);
        expect(vec.div(2, 4).toArray()).toEqual([3, 2]);
        expect(vec.divVec(other).toArray()).toEqual([3, 2]);
        expect(vec.toArray()).toEqual([6, 8]);
    });

    test('should compute distances and equality', () => {
        // Given
        const vec: Vec2 = new Vec2(0, 0);

        // When / Then
        expect(vec.distance(3, 4)).toEqual(5);
        expect(vec.distanceVec(new Vec2(6, 8))).toEqual(10);
        expect(vec.equal(0, 0)).toEqual(true);
        expect(vec.equal(0, 1)).toEqual(false);
    });
});
