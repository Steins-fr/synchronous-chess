import { describe, expect, test } from 'vitest';
import { hashSource } from './source.helper';

describe('source helper', () => {
    test('should hash an IP shortly, the same for a same IP only', () => {
        // When
        const hash: string = hashSource('203.0.113.7');

        // Then
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
        expect(hashSource('203.0.113.7')).toEqual(hash);
        expect(hashSource('203.0.113.8')).not.toEqual(hash);
    });
});
