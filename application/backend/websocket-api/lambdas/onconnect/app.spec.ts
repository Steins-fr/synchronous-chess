import { aConnectEvent } from '@testing/api-mocks';
import { describe, expect, test, vi } from 'vitest';
import { handler } from './app';

describe('onconnect lambda', () => {
    test('should accept the connection of a page of the game app', async () => {
        // Given
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        // When
        const response = await handler(aConnectEvent('connection'));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Connected' });
        expect(log).toHaveBeenCalledWith('New connection: connection');
    });

    test.each([
        ['a page of another domain', { Origin: 'https://attacker.test' }],
        ['a client out of a browser, without Origin', { 'User-Agent': 'websocat/1.13' }],
        ['a handshake without headers', null],
    ])('should refuse the connection of %s', async (_case: string, headers: Record<string, string> | null) => {
        // Given
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        // When
        const response = await handler(aConnectEvent('connection', headers));

        // Then
        expect(response).toEqual({ statusCode: 403, body: 'Forbidden' });
        expect(warn).toHaveBeenCalledWith('Connection refused, not from the game app: connection');
    });
});
