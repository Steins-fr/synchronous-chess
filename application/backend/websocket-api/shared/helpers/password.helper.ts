import { isText } from '@helpers/text.helper';
import { ROOM_PASSWORD_MAX_LENGTH } from '@protocol/room-limits';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SALT_BYTES: number = 16;
const KEY_BYTES: number = 32;

/** The password of a private room, from the network: a string of a reasonable length */
export function isPassword(value: unknown): value is string {
    return isText(value, ROOM_PASSWORD_MAX_LENGTH);
}

/**
 * What a room keeps of its password: chosen by a person, it may be guessed from a plain hash, so a salted scrypt key,
 * `salt:key` in hex
 */
export function hashPassword(password: string): string {
    const salt: Buffer = randomBytes(SALT_BYTES);
    return `${ salt.toString('hex') }:${ scryptSync(password, salt, KEY_BYTES).toString('hex') }`;
}

/** Whether the password is the one hashed, compared in a constant time */
export function verifyPassword(password: string, passwordHash: string): boolean {
    const [salt, key] = passwordHash.split(':');
    const expected: Buffer = Buffer.from(key, 'hex');
    return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), expected.length), expected);
}
