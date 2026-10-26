import { CryptoHelper } from '@app/helpers/crypto.helper';

/**
 * A safe prime p = 2q + 1, q prime. The cards are squares modulo p: they stay in the subgroup of the quadratic residues,
 * of prime order q, so every exponent but 0 modulo q has an inverse.
 */
export interface SraGroup {
    readonly prime: bigint;
    /** q, the order of the subgroup of the quadratic residues */
    readonly order: bigint;
}

export function safePrimeGroup(prime: bigint): SraGroup {
    return { prime, order: (prime - 1n) / 2n };
}

/** The 2048-bit MODP group of RFC 3526 */
export const MODP_2048_GROUP: SraGroup = safePrimeGroup(BigInt('0x'
    + 'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B'
    + '302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6'
    + '49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D'
    + '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183'
    + '995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF'));

/** base^exponent modulo modulus, by squaring */
export function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    let result: bigint = 1n;
    let square: bigint = base % modulus;

    for (let rest = exponent; rest > 0n; rest >>= 1n) {
        if (rest & 1n) {
            result = result * square % modulus;
        }
        square = square * square % modulus;
    }

    return result;
}

/** The inverse of a value modulo a prime, by the extended Euclidean algorithm */
export function modInverse(value: bigint, prime: bigint): bigint {
    let [remainder, nextRemainder] = [prime, ((value % prime) + prime) % prime];
    let [coefficient, nextCoefficient] = [0n, 1n];

    while (nextRemainder !== 0n) {
        const quotient: bigint = remainder / nextRemainder;
        [remainder, nextRemainder] = [nextRemainder, remainder - quotient * nextRemainder];
        [coefficient, nextCoefficient] = [nextCoefficient, coefficient - quotient * nextCoefficient];
    }

    if (remainder !== 1n) {
        throw new Error('No inverse of 0');
    }

    return ((coefficient % prime) + prime) % prime;
}

/**
 * The symbol of Jacobi of a value modulo an odd number, the symbol of Legendre modulo a prime: 1 for a square, -1 for
 * a value that is not one, 0 for a multiple. Far faster than the criterion of Euler, an exponentiation.
 */
export function jacobi(value: bigint, modulus: bigint): number {
    let [rest, odd] = [((value % modulus) + modulus) % modulus, modulus];
    let symbol: number = 1;

    while (rest !== 0n) {
        while ((rest & 1n) === 0n) {
            rest >>= 1n;
            const modulo8: bigint = odd & 7n;
            if (modulo8 === 3n || modulo8 === 5n) {
                symbol = -symbol;
            }
        }

        [rest, odd] = [odd, rest];
        if ((rest & 3n) === 3n && (odd & 3n) === 3n) {
            symbol = -symbol;
        }
        rest %= odd;
    }

    return odd === 1n ? symbol : 0;
}

const HEX: RegExp = /^[0-9a-f]{1,1024}$/;

/** A number received from a peer, in lowercase hexadecimal, undefined when it is not one */
export function parseHex(hex: unknown): bigint | undefined {
    return typeof hex === 'string' && HEX.test(hex) ? BigInt(`0x${ hex }`) : undefined;
}

/**
 * A value of the subgroup of the squares received from a peer, undefined when it is not one: a value that is not a
 * square would be told from the others by its symbol of Legendre (the attack of Lipton). 1 is left out too: a cipher
 * text or a key never gives it, but by a chance of 1 in q
 */
export function parseGroupValue(hex: unknown, group: SraGroup): bigint | undefined {
    const value: bigint | undefined = parseHex(hex);
    return value !== undefined && value > 1n && value < group.prime && jacobi(value, group.prime) === 1 ? value : undefined;
}

/**
 * The commutative cipher of Shamir, Rivest and Adleman: a value encrypted with several keys, in any order, is decrypted
 * with their inverses, in any order. A key is an exponent modulo q, its inverse decrypts.
 */
export class SraCipher {
    public constructor(public readonly group: SraGroup = MODP_2048_GROUP) {
    }

    /**
     * The value of a card, a square: the cipher keeps the squares squares, so no cipher text tells anything of its card
     * (the symbol of Legendre of the values, an attack of Lipton)
     */
    public encode(card: number): bigint {
        const root: bigint = BigInt(card) + 2n;
        return root * root % this.group.prime;
    }

    public randomKey(): bigint {
        return CryptoHelper.randomBigInt(this.group.order - 1n) + 1n;
    }

    /** The key decrypting what a key encrypts */
    public inverse(key: bigint): bigint {
        return modInverse(key, this.group.order);
    }

    /** One key doing what the keys do one after the other */
    public combine(keys: ReadonlyArray<bigint>): bigint {
        return keys.reduce((combined: bigint, key: bigint) => combined * key % this.group.order, 1n);
    }

    /** The key replacing a shuffle key with a key of a card, in one exponentiation */
    public lockKey(shuffleKey: bigint, cardKey: bigint): bigint {
        return this.combine([this.inverse(shuffleKey), cardKey]);
    }

    public apply(value: bigint, key: bigint): bigint {
        return modPow(value, key, this.group.prime);
    }

    /**
     * A value received from a peer, undefined when it is not one of the group: a value that is not a square would be
     * told from the others by its symbol of Legendre, a card marked to follow it
     */
    public parseValue(hex: unknown): bigint | undefined {
        return parseGroupValue(hex, this.group);
    }

    /** A key received from a peer, undefined when it is not one */
    public parseKey(hex: unknown): bigint | undefined {
        const key: bigint | undefined = parseHex(hex);
        return key !== undefined && key > 0n && key < this.group.order ? key : undefined;
    }

    public static toHex(value: bigint): string {
        return value.toString(16);
    }
}
