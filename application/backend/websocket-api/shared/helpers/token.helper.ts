import { createHash } from 'node:crypto';

/** The token of a page proving the player it gives: a string of a reasonable length, from the network */
export function isToken(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/** What a room keeps of the token of a player: a hash, enough for a random secret, never the token */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
