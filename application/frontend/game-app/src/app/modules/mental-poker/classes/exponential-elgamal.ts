import { CryptoHelper } from '@app/helpers/crypto.helper';
import { MODP_2048_GROUP, modPow, parseGroupValue, parseHex, SraGroup } from './sra-cipher';

/** A cipher text of the exponential ElGamal: (g^r, g^m × h^r), m the count it hides, h the public key */
export interface ElGamalCipherText {
    readonly c1: bigint;
    readonly c2: bigint;
}

/** A cipher text as it travels, in hexadecimal */
export type ElGamalCipherTextHex = readonly [string, string];

/**
 * The exponential ElGamal over the squares modulo a safe prime, the group of the SRA cipher: a count m is hidden as
 * g^m, so the product of two cipher texts hides the sum of their counts. The players each hold a share x of the key
 * h = g^(x1 + x2) = h1 × h2: a cipher text is only decrypted with the share of every one of them, c1^x, and gives a
 * small count only (0 to `maxCount`), found by comparing it with the powers of g.
 *
 * A cipher text re-randomized (multiplied by an encryption of 0) hides the same count, and can not be told from a new
 * one without the key: no one follows a cipher text from a list to another one (decisional Diffie-Hellman).
 */
export class ExponentialElGamal {
    /** 2², a square: it generates the subgroup of the squares, of prime order, whatever the safe prime */
    public readonly generator: bigint = 4n;
    /** g⁻¹, its power q - 1, as g is of order q: computed once, each proof of a bit needs it */
    public readonly inverseGenerator: bigint;

    public constructor(public readonly group: SraGroup = MODP_2048_GROUP) {
        this.inverseGenerator = this.power(group.order - 1n);
    }

    /** A secret exponent, a share of the key or a randomness, from 1 to q - 1 */
    public randomScalar(): bigint {
        return CryptoHelper.randomBigInt(this.group.order - 1n) + 1n;
    }

    /** g^exponent */
    public power(exponent: bigint): bigint {
        return modPow(this.generator, exponent, this.group.prime);
    }

    public multiplyValues(values: ReadonlyArray<bigint>): bigint {
        return values.reduce((product: bigint, value: bigint) => product * value % this.group.prime, 1n);
    }

    public encrypt(count: number, key: bigint, randomness: bigint): ElGamalCipherText {
        return { c1: this.power(randomness), c2: this.power(BigInt(count)) * modPow(key, randomness, this.group.prime) % this.group.prime };
    }

    /** The same count, under another randomness */
    public reRandomize(cipherText: ElGamalCipherText, key: bigint, randomness: bigint): ElGamalCipherText {
        return this.multiply(cipherText, this.encrypt(0, key, randomness));
    }

    /** A cipher text hiding the sum of their counts */
    public multiply(...cipherTexts: ReadonlyArray<ElGamalCipherText>): ElGamalCipherText {
        return {
            c1: this.multiplyValues(cipherTexts.map((cipherText: ElGamalCipherText) => cipherText.c1)),
            c2: this.multiplyValues(cipherTexts.map((cipherText: ElGamalCipherText) => cipherText.c2)),
        };
    }

    /** The share of a player decrypting a cipher text: c1^x */
    public share(cipherText: ElGamalCipherText, secret: bigint): bigint {
        return modPow(cipherText.c1, secret, this.group.prime);
    }

    /**
     * The count of a cipher text, given the share of every player, undefined when it is above the greatest count: a
     * cipher text made otherwise than the protocol says
     */
    public decrypt(cipherText: ElGamalCipherText, shares: ReadonlyArray<bigint>, maxCount: number): number | undefined {
        // c2 / (c1^x1 × c1^x2): the inverse of a square, of order q, is its power q - 1
        const masked: bigint = modPow(this.multiplyValues(shares), this.group.order - 1n, this.group.prime);
        return this.count(cipherText.c2 * masked % this.group.prime, maxCount);
    }

    /** The count of a cipher text, given the key of every player, x1 + x2: c2 / c1^x = c2 × c1^(q - x), one power only */
    public decryptWithKey(cipherText: ElGamalCipherText, secret: bigint, maxCount: number): number | undefined {
        const masked: bigint = modPow(cipherText.c1, (this.group.order - secret % this.group.order) % this.group.order, this.group.prime);
        return this.count(cipherText.c2 * masked % this.group.prime, maxCount);
    }

    /** The count of g^m, undefined above the greatest count */
    private count(plain: bigint, maxCount: number): number | undefined {
        let power: bigint = 1n;
        for (let count = 0; count <= maxCount; count++) {
            if (plain === power) {
                return count;
            }
            power = power * this.generator % this.group.prime;
        }
        return undefined;
    }

    /** A value of the group received from a peer, undefined when it is not one */
    public parseValue(hex: unknown): bigint | undefined {
        return parseGroupValue(hex, this.group);
    }

    /** An exponent received from a peer (a response of a proof, a disclosed share of the key), from 0 to q - 1 */
    public parseScalar(hex: unknown): bigint | undefined {
        const scalar: bigint | undefined = parseHex(hex);
        return scalar !== undefined && scalar < this.group.order ? scalar : undefined;
    }

    public parseCipherText(value: unknown): ElGamalCipherText | undefined {
        if (!Array.isArray(value) || value.length !== 2) {
            return undefined;
        }
        const [c1, c2] = [this.parseValue(value[0]), this.parseValue(value[1])];
        return c1 === undefined || c2 === undefined ? undefined : { c1, c2 };
    }

    public static toHex(cipherText: ElGamalCipherText): ElGamalCipherTextHex {
        return [cipherText.c1.toString(16), cipherText.c2.toString(16)];
    }
}
