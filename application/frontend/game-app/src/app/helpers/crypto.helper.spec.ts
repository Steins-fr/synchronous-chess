import { CryptoHelper } from '@app/helpers/crypto.helper';
import { afterEach, describe, test, expect, vi } from 'vitest';

describe('CryptoHelper', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('randomBigInt should draw again the values beyond its bound, with the bits of the bound only', () => {
        // Given draws of 0xff then 0x05: the bits above the 3 of the bound 6 are dropped, 7 then 5
        const draws: number[] = [0xff, 0x05];
        vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
            (array as unknown as Uint8Array)[0] = draws.shift() ?? 0;
            return array;
        });

        // When / Then
        expect(CryptoHelper.randomBigInt(6n)).toEqual(5n);
        expect(draws).toEqual([]);
    });

    test('randomBigInt should stay below its bound, on several bytes', () => {
        const bound: bigint = 2n ** 70n + 3n;
        for (let i = 0; i < 50; i++) {
            const result: bigint = CryptoHelper.randomBigInt(bound);
            expect(result >= 0n && result < bound).toEqual(true);
        }
        expect(CryptoHelper.randomBigInt(1n)).toEqual(0n);
        expect(() => CryptoHelper.randomBigInt(0n)).toThrow('No integer from 0 to 0 excluded');
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
