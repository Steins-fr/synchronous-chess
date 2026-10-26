import { describe, expect, test } from 'vitest';
import { TEST_GROUP } from '@testing/sra-test-group';
import { ElGamalCipherText, ExponentialElGamal } from './exponential-elgamal';
import { BitProof, EqualLogsProof, proveBit, proveEqualLogs, verifyBit, verifyEqualLogs } from './zk-proofs';

describe('zero-knowledge proofs', () => {
    const cipher = new ExponentialElGamal(TEST_GROUP);

    describe('equal logarithms', () => {
        test('should prove the knowledge of a share of the key, for its context only', async () => {
            // Given
            const secret: bigint = cipher.randomScalar();
            const key: bigint = cipher.power(secret);

            // When
            const proof: EqualLogsProof = await proveEqualLogs(cipher, 'game:0', [cipher.generator], [key], secret);

            // Then
            expect(await verifyEqualLogs(cipher, 'game:0', [cipher.generator], [key], proof)).toBe(true);
            expect(await verifyEqualLogs(cipher, 'game:1', [cipher.generator], [key], proof)).toBe(false);
            expect(await verifyEqualLogs(cipher, 'game:0', [cipher.generator], [cipher.power(secret + 1n)], proof)).toBe(false);
        });

        test('should prove a share of a decryption is made with the share of the key', async () => {
            // Given
            const secret: bigint = cipher.randomScalar();
            const key: bigint = cipher.power(secret);
            const cipherText: ElGamalCipherText = cipher.encrypt(1, key, cipher.randomScalar());
            const share: bigint = cipher.share(cipherText, secret);

            // When
            const proof: EqualLogsProof = await proveEqualLogs(cipher, 'share', [cipher.generator, cipherText.c1], [key, share], secret);

            // Then
            expect(await verifyEqualLogs(cipher, 'share', [cipher.generator, cipherText.c1], [key, share], proof)).toBe(true);
            // A share chosen to give another count
            const forged: bigint = share * cipher.generator % TEST_GROUP.prime;
            expect(await verifyEqualLogs(cipher, 'share', [cipher.generator, cipherText.c1], [key, forged], proof)).toBe(false);
            const forgedProof: EqualLogsProof = await proveEqualLogs(cipher, 'share', [cipher.generator, cipherText.c1], [key, forged], secret);
            expect(await verifyEqualLogs(cipher, 'share', [cipher.generator, cipherText.c1], [key, forged], forgedProof)).toBe(false);
        });

        test.each<[string, unknown]>([
            ['no array', 'proof'],
            ['a missing response', ['1']],
            ['a malformed challenge', ['x', '1']],
            ['a response out of the exponents', ['1', TEST_GROUP.order.toString(16)]],
        ])('should refuse a proof with %s', async (_: string, proof: unknown) => {
            expect(await verifyEqualLogs(cipher, 'game', [cipher.generator], [cipher.power(2n)], proof)).toBe(false);
        });
    });

    describe('bits', () => {
        const key: bigint = cipher.power(cipher.randomScalar());

        test.each<[0 | 1]>([[0], [1]])('should prove a cipher text hides %s, or 1, without telling which', async (bit: 0 | 1) => {
            // Given
            const randomness: bigint = cipher.randomScalar();
            const cipherText: ElGamalCipherText = cipher.encrypt(bit, key, randomness);

            // When
            const proof: BitProof = await proveBit(cipher, 'load:3', key, cipherText, bit, randomness);

            // Then
            expect(await verifyBit(cipher, 'load:3', key, cipherText, proof)).toBe(true);
            expect(await verifyBit(cipher, 'load:4', key, cipherText, proof)).toBe(false);
        });

        test('should not prove a cipher text hides a bit when it hides 2', async () => {
            // Given
            const randomness: bigint = cipher.randomScalar();
            const cipherText: ElGamalCipherText = cipher.encrypt(2, key, randomness);

            // When
            const proofs: BitProof[] = await Promise.all([proveBit(cipher, 'load', key, cipherText, 0, randomness), proveBit(cipher, 'load', key, cipherText, 1, randomness)]);

            // Then
            expect(await Promise.all(proofs.map((proof: BitProof) => verifyBit(cipher, 'load', key, cipherText, proof)))).toEqual([false, false]);
        });

        test.each<[string, unknown]>([
            ['no array', 'proof'],
            ['a missing response', ['1', '1', '1']],
            ['a malformed response', ['1', '1', '1', 'x']],
        ])('should refuse a proof with %s', async (_: string, proof: unknown) => {
            expect(await verifyBit(cipher, 'load', key, cipher.encrypt(0, key, 3n), proof)).toBe(false);
        });
    });

    test('should prove and check a bit at 2048 bits', async () => {
        // Given
        const fullCipher = new ExponentialElGamal();
        const fullKey: bigint = fullCipher.power(fullCipher.randomScalar());
        const randomness: bigint = fullCipher.randomScalar();
        const cipherText: ElGamalCipherText = fullCipher.encrypt(1, fullKey, randomness);

        // When
        const proof: BitProof = await proveBit(fullCipher, 'load', fullKey, cipherText, 1, randomness);

        // Then
        expect(await verifyBit(fullCipher, 'load', fullKey, cipherText, proof)).toBe(true);
    }, 30_000);
});
