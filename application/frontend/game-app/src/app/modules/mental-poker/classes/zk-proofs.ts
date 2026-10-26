import { CryptoHelper } from '@app/helpers/crypto.helper';
import { ElGamalCipherText, ExponentialElGamal } from './exponential-elgamal';
import { modPow } from './sra-cipher';

/**
 * The proofs a player gives of its messages, non interactive (Fiat-Shamir): the challenge is the hash of the context
 * of the proof and of every value it binds, so a proof made for a game, a seat or a step proves nothing of another one.
 * Each proof travels as its challenge and its responses, in hexadecimal: the verifier rebuilds the commitments from
 * them, then checks they give the challenge back.
 */

/** A proof that the same secret x gives each value from its base, value = base^x: a challenge and a response */
export type EqualLogsProof = readonly [string, string];

/** A proof that a cipher text hides a count of 0 or 1, without telling which: two challenges, two responses */
export type BitProof = readonly [string, string, string, string];

/** The challenge of a proof, an exponent: the hash of the group, of the context and of the values it binds */
async function challenge(cipher: ExponentialElGamal, context: string, values: ReadonlyArray<bigint>): Promise<bigint> {
    const text: string = [context, ...[cipher.group.prime, cipher.generator, ...values].map((value: bigint) => value.toString(16))].join('|');
    return BigInt(`0x${ await CryptoHelper.sha256(text) }`) % cipher.group.order;
}

/** base^exponent × value^-challenge: the commitment a response gives back, the inverse of a square being its power q - 1 */
function commitmentOf(cipher: ExponentialElGamal, base: bigint, response: bigint, value: bigint, challengeValue: bigint): bigint {
    const { prime, order } = cipher.group;
    return modPow(base, response, prime) * modPow(value, (order - challengeValue) % order, prime) % prime;
}

/**
 * Proves the same secret gives each value from its base: a single base proves the knowledge of a share of the key
 * (Schnorr), two prove a share of a decryption (Chaum-Pedersen)
 */
export async function proveEqualLogs(
    cipher: ExponentialElGamal, context: string, bases: ReadonlyArray<bigint>, values: ReadonlyArray<bigint>, secret: bigint,
): Promise<EqualLogsProof> {
    const nonce: bigint = cipher.randomScalar();
    const commitments: bigint[] = bases.map((base: bigint) => modPow(base, nonce, cipher.group.prime));
    const challengeValue: bigint = await challenge(cipher, context, [...bases, ...values, ...commitments]);
    const response: bigint = (nonce + challengeValue * secret) % cipher.group.order;
    return [challengeValue.toString(16), response.toString(16)];
}

export async function verifyEqualLogs(
    cipher: ExponentialElGamal, context: string, bases: ReadonlyArray<bigint>, values: ReadonlyArray<bigint>, proof: unknown,
): Promise<boolean> {
    if (!Array.isArray(proof) || proof.length !== 2) {
        return false;
    }
    const [challengeValue, response] = [cipher.parseScalar(proof[0]), cipher.parseScalar(proof[1])];
    if (challengeValue === undefined || response === undefined) {
        return false;
    }
    const commitments: bigint[] = bases.map((base: bigint, index: number) => commitmentOf(cipher, base, response, values[index], challengeValue));
    return await challenge(cipher, context, [...bases, ...values, ...commitments]) === challengeValue;
}

/** The two statements of a bit: (c1, c2) = (g^r, h^r) for 0, (c1, c2 / g) = (g^r, h^r) for 1 */
function bitStatements(cipher: ExponentialElGamal, cipherText: ElGamalCipherText): ReadonlyArray<bigint> {
    return [cipherText.c2, cipherText.c2 * cipher.inverseGenerator % cipher.group.prime];
}

/**
 * Proves a cipher text, made with the randomness, hides the bit (the disjunctive proof of Cramer, Damgård and
 * Schoenmakers): the statement of the other bit is simulated, its challenge drawn first, and the challenges of both
 * sum to the one of the hash, so one of them at least is answered for real, without telling which
 */
export async function proveBit(
    cipher: ExponentialElGamal, context: string, key: bigint, cipherText: ElGamalCipherText, bit: 0 | 1, randomness: bigint,
): Promise<BitProof> {
    const { prime, order } = cipher.group;
    const statements: ReadonlyArray<bigint> = bitStatements(cipher, cipherText);
    const other: 0 | 1 = bit === 0 ? 1 : 0;
    const [otherChallenge, otherResponse, nonce] = [cipher.randomScalar(), cipher.randomScalar(), cipher.randomScalar()];

    const commitments: bigint[][] = [];
    commitments[bit] = [cipher.power(nonce), modPow(key, nonce, prime)];
    commitments[other] = [
        commitmentOf(cipher, cipher.generator, otherResponse, cipherText.c1, otherChallenge),
        commitmentOf(cipher, key, otherResponse, statements[other], otherChallenge),
    ];
    const challengeValue: bigint = await challenge(cipher, context, [key, cipherText.c1, cipherText.c2, ...commitments.flat()]);

    const challenges: bigint[] = [];
    const responses: bigint[] = [];
    challenges[other] = otherChallenge;
    responses[other] = otherResponse;
    challenges[bit] = ((challengeValue - otherChallenge) % order + order) % order;
    responses[bit] = (nonce + challenges[bit] * randomness) % order;
    const [challenge0, challenge1, response0, response1] = [...challenges, ...responses].map((value: bigint) => value.toString(16));
    return [challenge0, challenge1, response0, response1];
}

export async function verifyBit(
    cipher: ExponentialElGamal, context: string, key: bigint, cipherText: ElGamalCipherText, proof: unknown,
): Promise<boolean> {
    if (!Array.isArray(proof) || proof.length !== 4) {
        return false;
    }
    const scalars: Array<bigint | undefined> = proof.map((value: unknown) => cipher.parseScalar(value));
    if (scalars.includes(undefined)) {
        return false;
    }
    const [challenge0, challenge1, response0, response1] = scalars as bigint[];
    const statements: ReadonlyArray<bigint> = bitStatements(cipher, cipherText);
    const commitments: bigint[] = [[challenge0, response0], [challenge1, response1]].flatMap(([challengeValue, response]: bigint[], bit: number) => [
        commitmentOf(cipher, cipher.generator, response, cipherText.c1, challengeValue),
        commitmentOf(cipher, key, response, statements[bit], challengeValue),
    ]);
    const challengeValue: bigint = await challenge(cipher, context, [key, cipherText.c1, cipherText.c2, ...commitments]);
    return (challenge0 + challenge1) % cipher.group.order === challengeValue;
}
