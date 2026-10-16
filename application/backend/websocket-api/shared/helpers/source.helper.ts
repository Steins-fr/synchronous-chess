import { getSourceHashSecret } from '@helpers/environment.helper';
import { createHmac } from 'node:crypto';

/**
 * What the API keeps of the IP of a client: a short HMAC, enough to tell the clients apart, never the IP. Keyed by a
 * secret of the environment: the 2^32 IPv4 addresses are not hashed in turn to find the one of a hash without it
 */
export function hashSource(sourceIp: string): string {
    return createHmac('sha256', getSourceHashSecret()).update(sourceIp).digest('hex').slice(0, 16);
}
