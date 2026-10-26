import { describe, expect, test } from 'vitest';
import { TEST_GROUP } from '@testing/sra-test-group';
import { ElGamalCipherText, ExponentialElGamal } from './exponential-elgamal';
import { MODP_2048_GROUP, modPow } from './sra-cipher';

describe('ExponentialElGamal', () => {
    const cipher = new ExponentialElGamal(TEST_GROUP);

    /** The key of two players, and the cipher texts decrypted with the share of each */
    function players(): { secrets: bigint[]; key: bigint; decrypt: (cipherText: ElGamalCipherText) => number | undefined } {
        const secrets: bigint[] = [cipher.randomScalar(), cipher.randomScalar()];
        return {
            secrets,
            key: cipher.multiplyValues(secrets.map((secret: bigint) => cipher.power(secret))),
            decrypt: (cipherText: ElGamalCipherText) => cipher.decrypt(cipherText, secrets.map((secret: bigint) => cipher.share(cipherText, secret)), 2),
        };
    }

    test('should use the 2048-bit safe prime of RFC 3526 by default, 4 generating its squares', () => {
        // Then
        const { group, generator } = new ExponentialElGamal();
        expect(group).toBe(MODP_2048_GROUP);
        expect(modPow(generator, group.order, group.prime)).toEqual(1n);
        expect(modPow(cipher.generator, TEST_GROUP.order, TEST_GROUP.prime)).toEqual(1n);
        expect(cipher.generator * cipher.inverseGenerator % TEST_GROUP.prime).toEqual(1n);
    });

    test('should decrypt a count with the share of every player only', () => {
        // Given
        const { secrets, key, decrypt } = players();

        // When
        const cipherTexts: ElGamalCipherText[] = [0, 1, 2].map((count: number) => cipher.encrypt(count, key, cipher.randomScalar()));

        // Then
        expect(cipherTexts.map(decrypt)).toEqual([0, 1, 2]);
        // A share alone gives no count
        expect(cipher.decrypt(cipherTexts[1], [cipher.share(cipherTexts[1], secrets[0])], 2)).toBeUndefined();
        // Nor a share alone as the key, which both shares make
        const secret: bigint = (secrets[0] + secrets[1]) % TEST_GROUP.order;
        expect(cipherTexts.map((cipherText: ElGamalCipherText) => cipher.decryptWithKey(cipherText, secret, 2))).toEqual([0, 1, 2]);
        expect(cipher.decryptWithKey(cipherTexts[1], secrets[0], 2)).toBeUndefined();
        expect(cipher.decryptWithKey(cipher.encrypt(1, cipher.power(0n), 3n), 0n, 2)).toEqual(1);
    });

    test('should add the counts of the cipher texts multiplied, and keep a count re-randomized', () => {
        // Given
        const { key, decrypt } = players();
        const [one, other] = [cipher.encrypt(1, key, cipher.randomScalar()), cipher.encrypt(1, key, cipher.randomScalar())];

        // When
        const sum: ElGamalCipherText = cipher.multiply(one, other);
        const reRandomized: ElGamalCipherText = cipher.reRandomize(one, key, cipher.randomScalar());

        // Then
        expect(decrypt(sum)).toEqual(2);
        expect(decrypt(reRandomized)).toEqual(1);
        expect(reRandomized.c1).not.toEqual(one.c1);
        expect(reRandomized.c2).not.toEqual(one.c2);
    });

    test('should give no count above the greatest one', () => {
        // Given
        const { key, decrypt } = players();

        // Then
        expect(decrypt(cipher.encrypt(3, key, cipher.randomScalar()))).toBeUndefined();
    });

    test('should read the values, the exponents and the cipher texts received from a peer', () => {
        // Given
        const cipherText: ElGamalCipherText = cipher.encrypt(1, players().key, cipher.randomScalar());

        // Then
        expect(cipher.parseCipherText(ExponentialElGamal.toHex(cipherText))).toEqual(cipherText);
        expect(cipher.parseCipherText([ExponentialElGamal.toHex(cipherText)[0], '1'])).toBeUndefined();
        expect(cipher.parseCipherText(['4'])).toBeUndefined();
        expect(cipher.parseCipherText('4')).toBeUndefined();
        expect(cipher.parseValue('4')).toEqual(4n);
        expect(cipher.parseValue('1')).toBeUndefined();
        expect(cipher.parseScalar('0')).toEqual(0n);
        expect(cipher.parseScalar(TEST_GROUP.order.toString(16))).toBeUndefined();
        expect(cipher.parseScalar(0)).toBeUndefined();
    });

    test('should draw secret exponents from 1 to q - 1', () => {
        // When
        const scalars: bigint[] = Array.from({ length: 20 }, () => cipher.randomScalar());

        // Then
        scalars.forEach((scalar: bigint) => expect(scalar > 0n && scalar < TEST_GROUP.order).toBe(true));
        expect(new Set(scalars).size).toEqual(20);
    });
});
