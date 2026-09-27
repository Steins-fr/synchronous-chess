import { CryptoHelper } from '@app/helpers/crypto.helper';
import { afterEach, describe, test, expect, vi } from 'vitest';

describe('CryptoHelper', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('randomNumber should return the lower bound for the lowest random value', () => {
        // Given
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
            (array as unknown as Uint32Array)[0] = 0;
            return array;
        });

        // When
        const result: number = CryptoHelper.randomNumber(3, 7);

        // Then
        expect(result).toEqual(3);
    });

    test('randomNumber should return the upper bound for the highest random value', () => {
        // Given
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
            (array as unknown as Uint32Array)[0] = 0xffffffff;
            return array;
        });

        // When
        const result: number = CryptoHelper.randomNumber(3, 7);

        // Then
        expect(result).toEqual(7);
    });

    test('randomNumber should stay within the bounds', () => {
        for (let i = 0; i < 50; i++) {
            const result: number = CryptoHelper.randomNumber(-2, 2);
            expect(result).toBeGreaterThanOrEqual(-2);
            expect(result).toBeLessThanOrEqual(2);
            expect(Number.isInteger(result)).toEqual(true);
        }
    });
});
