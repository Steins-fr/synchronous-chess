import { CryptoHelper } from '@app/helpers/crypto.helper';

/** The bytes of a salt: a commitment to a value among a few can not be guessed by trying them all */
export const SALT_BYTES: number = 16;

const COMMITMENT: RegExp = /^[0-9a-f]{64}$/;

/** What a commitment binds: the round, the player, the value, the salt... */
export type CommitmentPart = string | number;

/**
 * The text joining the parts. Each game keeps its own: changing it would change every commitment of the game. A part
 * holding it, as an id of salts joined by colons, has a fixed form: two lists of parts must not give one
 * text, or two values would share a commitment
 */
export type CommitmentSeparator = ' ' | ':';

/** A random salt, as an hexadecimal string */
export function drawSalt(): string {
    return CryptoHelper.randomHex(SALT_BYTES);
}

/** A SHA-256 digest, as the hexadecimal string a commitment is */
export function isCommitment(value: unknown): value is string {
    return typeof value === 'string' && COMMITMENT.test(value);
}

/** The commitment to the parts: the SHA-256 digest of their text, joined by the separator */
export function commitmentOf(parts: ReadonlyArray<CommitmentPart>, separator: CommitmentSeparator): Promise<string> {
    return CryptoHelper.sha256(parts.join(separator));
}
