import { createHash, randomBytes } from 'node:crypto';

/** The secret a room gives its host, to reconnect the room to another connection: 256 random bits */
export function generateHostToken(): string {
    return randomBytes(32).toString('base64url');
}

/** What the room keeps of the token of its host: a hash, enough for a secret of this entropy, never the token */
export function hashHostToken(hostToken: string): string {
    return createHash('sha256').update(hostToken).digest('hex');
}
