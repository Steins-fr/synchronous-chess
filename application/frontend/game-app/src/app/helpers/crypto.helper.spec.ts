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

    test('randomHex should give random bytes as hexadecimal', () => {
        // Given
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
            (array as unknown as Uint8Array).set([0, 15, 255]);
            return array;
        });

        // When / Then
        expect(CryptoHelper.randomHex(3)).toEqual('000fff');
    });

    test('sha256 should digest a text as hexadecimal', async () => {
        expect(await CryptoHelper.sha256('abc')).toEqual('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
