import { placesOf } from './places';
import { describe, expect, test } from 'vitest';

describe('placesOf', () => {
    test('should place the highest keys first, equal keys sharing a place', () => {
        // Then
        expect(placesOf([3, 9, 3, -1, 9])).toEqual([3, 1, 3, 5, 1]);
    });
});
