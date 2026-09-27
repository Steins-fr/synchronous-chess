import { objectHasValue } from '@app/helpers/object.helper';
import { describe, test, expect } from 'vitest';

describe('objectHasValue', () => {
    test('should indicate if a value belongs to the object', () => {
        // Given
        const obj: Record<string, string> = { a: 'first', b: 'second' };

        // When / Then
        expect(objectHasValue(obj, 'second')).toEqual(true);
        expect(objectHasValue(obj, 'b')).toEqual(false);
    });
});
