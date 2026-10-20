import { DatabaseOperationEnum } from '@exceptions/database-exception';
import RoomRepository from '@repositories/room-repository';
import { aDatabaseFailure, anHttpEvent, aRoom, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './app';

const JSON_HEADERS: Record<string, string> = { 'Content-Type': 'application/json' };

describe('httpapi lambda', () => {
    useTestDatabase();

    beforeEach(() => {
        // The lambda logs its failures
        vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    });

    /** The response of the lambda, its body parsed: to a page of the game app by default */
    async function request(routeKey: string, rawQueryString: string = '', headers?: Record<string, string>): Promise<{ statusCode: number; headers: Record<string, string>; body: unknown }> {
        const response = await handler(anHttpEvent(routeKey, rawQueryString, undefined, headers));
        return { ...response, body: JSON.parse(response.body) };
    }

    test('should answer the open rooms of a game in JSON', async () => {
        // Given
        await storeRoom(aRoom());

        // When
        const response = await request('GET /rooms', 'game=chess');

        // Then
        expect(response).toEqual({
            statusCode: 200,
            headers: JSON_HEADERS,
            body: {
                rooms: [{ roomName: 'room', hostPlayer: 'host', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true }],
                hasMore: false,
            },
        });
    });

    test.each([
        ['a page of another domain', { origin: 'https://attacker.test' }],
        ['a client out of a browser, without Origin', { 'user-agent': 'curl/8.5.0' }],
    ])('should refuse %s, without reading the database', async (_case: string, headers: Record<string, string>) => {
        // Given
        const findRecentRooms = vi.spyOn(RoomRepository.prototype, 'findRecentRooms');

        // When
        const response = await request('GET /rooms', 'game=chess', headers);

        // Then
        expect(response).toEqual({ statusCode: 403, headers: JSON_HEADERS, body: { message: 'Forbidden' } });
        expect(findRecentRooms).not.toHaveBeenCalled();
    });

    test('should answer a server error without the origins of the game app in its environment', async () => {
        // Given
        vi.stubEnv('ALLOWED_ORIGINS', undefined);

        // When
        const response = await request('GET /rooms', 'game=chess');

        // Then
        expect(response).toEqual({ statusCode: 500, headers: JSON_HEADERS, body: { message: 'Server error.' } });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(new Error('No ALLOWED_ORIGINS: the origins of the game app, set by infrastructure/main.tf for onconnect and httpapi, by local/server.ts locally'));
    });

    test('should answer a refused request with its message', async () => {
        // When
        const response = await request('GET /rooms', 'game=go');

        // Then
        expect(response).toEqual({ statusCode: 400, headers: JSON_HEADERS, body: { message: 'Payload not valid' } });
        expect(console.error).toHaveBeenCalledOnce();
    });

    test('should answer a server error, without its message, when the database fails', async () => {
        // Given
        const failure = aDatabaseFailure(DatabaseOperationEnum.QUERY);
        vi.spyOn(RoomRepository.prototype, 'findRecentRooms').mockRejectedValue(failure);

        // When
        const response = await request('GET /rooms', 'game=chess');

        // Then
        expect(response).toEqual({ statusCode: 500, headers: JSON_HEADERS, body: { message: 'Server error.' } });
        expect(console.error).toHaveBeenCalledExactlyOnceWith(failure);
    });

    test('should answer not found to a route without handler', async () => {
        // When
        const response = await request('POST /rooms');

        // Then
        expect(response).toEqual({ statusCode: 404, headers: JSON_HEADERS, body: { message: 'Not found' } });
    });
});
