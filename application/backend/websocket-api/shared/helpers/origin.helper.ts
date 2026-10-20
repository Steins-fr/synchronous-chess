import { getAllowedOrigins } from './environment.helper';
import { EventHeaders, headerValue } from './header.helper';

/**
 * Whether a request comes from a page of the game app of the stage: a browser sends its Origin with the handshake of a
 * websocket, and with a request to another origin. Refused before any statement, a client out of a browser (a bot, a
 * scanner) never wakes the paused database; one forging the header still may
 * @throws {Error} when the environment of the lambda does not give the origins of the game app
 */
export function isAllowedOrigin(headers: EventHeaders): boolean {
    const origin: string | undefined = headerValue(headers, 'Origin');

    return origin !== undefined && getAllowedOrigins().includes(origin);
}
