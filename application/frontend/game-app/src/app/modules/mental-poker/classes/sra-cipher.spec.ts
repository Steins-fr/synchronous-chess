import { CryptoHelper } from '@app/helpers/crypto.helper';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { TEST_GROUP } from '@testing/sra-test-group';
import { MODP_2048_GROUP, modInverse, modPow, SraCipher } from './sra-cipher';

describe('SraCipher', () => {
    const cipher = new SraCipher(TEST_GROUP);

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('modPow should raise a number to a power modulo another', () => {
        expect(modPow(4n, 13n, 497n)).toEqual(445n);
        expect(modPow(7n, 0n, 13n)).toEqual(1n);
        expect(modPow(20n, 1n, 7n)).toEqual(6n);
    });

    test('modInverse should invert a number modulo a prime, and refuse 0', () => {
        expect(modInverse(3n, 11n)).toEqual(4n);
        expect(modInverse(-3n, 11n)).toEqual(7n);
        expect(() => modInverse(22n, 11n)).toThrow('No inverse of 0');
    });

    test('should use the 2048-bit safe prime of RFC 3526 by default', () => {
        // Then
        const { group } = new SraCipher();
        expect(group).toBe(MODP_2048_GROUP);
        expect(group.prime.toString(2)).toHaveLength(2048);
        expect(group.order * 2n + 1n).toEqual(group.prime);
        // 2 generates the subgroup of order q
        expect(modPow(2n, group.order, group.prime)).toEqual(1n);
    });

    test('should encode each card as a different square', () => {
        // When
        const values: bigint[] = Array.from({ length: 20 }, (_, card: number) => cipher.encode(card));

        // Then a square has the order q, as every cipher text made from it
        expect(new Set(values).size).toEqual(20);
        values.forEach((value: bigint) => expect(modPow(value, TEST_GROUP.order, TEST_GROUP.prime)).toEqual(1n));
    });

    test('should decrypt a card encrypted with several keys, in any order', () => {
        // Given
        const [key1, key2] = [cipher.randomKey(), cipher.randomKey()];
        const card: bigint = cipher.encode(7);

        // When
        const encrypted: bigint = cipher.apply(cipher.apply(card, key1), key2);

        // Then
        expect(cipher.apply(cipher.apply(card, key2), key1)).toEqual(encrypted);
        expect(cipher.apply(cipher.apply(encrypted, cipher.inverse(key1)), cipher.inverse(key2))).toEqual(card);
        expect(cipher.apply(encrypted, cipher.combine([cipher.inverse(key2), cipher.inverse(key1)]))).toEqual(card);
        expect(cipher.combine([])).toEqual(1n);
    });

    test('should draw the keys from 1 to q - 1', () => {
        // Given
        const randomBigInt = vi.spyOn(CryptoHelper, 'randomBigInt').mockReturnValue(0n);

        // When / Then
        expect(cipher.randomKey()).toEqual(1n);
        expect(randomBigInt).toHaveBeenCalledWith(TEST_GROUP.order - 1n);
    });

    test('should parse the values and the keys of the group only', () => {
        // Then
        expect(cipher.parseValue(SraCipher.toHex(255n))).toEqual(255n);
        expect(cipher.parseValue('1')).toBeUndefined();
        expect(cipher.parseValue(SraCipher.toHex(TEST_GROUP.prime))).toBeUndefined();
        expect(cipher.parseKey('1')).toEqual(1n);
        expect(cipher.parseKey('0')).toBeUndefined();
        expect(cipher.parseKey(SraCipher.toHex(TEST_GROUP.order))).toBeUndefined();
        expect(cipher.parseKey('0x1')).toBeUndefined();
        expect(cipher.parseKey('FF')).toBeUndefined();
        expect(cipher.parseKey('')).toBeUndefined();
        expect(cipher.parseKey(1)).toBeUndefined();
    });
});
