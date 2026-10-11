import { createHash } from 'node:crypto';

/** What a room keeps of the IP of a client: a short hash, enough to tell the clients apart, never the IP */
export function hashSource(sourceIp: string): string {
    return createHash('sha256').update(sourceIp).digest('hex').slice(0, 16);
}
