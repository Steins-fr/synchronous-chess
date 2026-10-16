import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
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

    test('should hash an IP with the secret: not found again without it', () => {
        // Given
        const hash: string = hashSource('203.0.113.7');
        vi.stubEnv('SOURCE_HASH_SECRET', 'another-secret');

        // When / Then
        expect(hashSource('203.0.113.7')).not.toEqual(hash);
        expect(hash).not.toEqual(createHash('sha256').update('203.0.113.7').digest('hex').slice(0, 16));
    });

    test('should refuse to hash an IP without secret', () => {
        // Given
        vi.stubEnv('SOURCE_HASH_SECRET', '');

        // When / Then
        expect(() => hashSource('203.0.113.7')).toThrow('No SOURCE_HASH_SECRET');
    });
});
