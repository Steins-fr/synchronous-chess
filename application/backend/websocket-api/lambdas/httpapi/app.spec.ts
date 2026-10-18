import { DatabaseOperationEnum } from '@exceptions/database-exception';
import HealthRepository from '@repositories/health-repository';
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

    /** The response of the lambda, its body parsed */
    async function request(routeKey: string, rawQueryString: string = ''): Promise<{ statusCode: number; headers: Record<string, string>; body: unknown }> {
        const response = await handler(anHttpEvent(routeKey, rawQueryString));
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

    test('should answer the API is up once its database answers', async () => {
        expect(await request('GET /health')).toEqual({ statusCode: 200, headers: JSON_HEADERS, body: { status: 'up' } });
    });

    test('should answer a server error while the database of the API fails', async () => {
        // Given
        vi.spyOn(HealthRepository.prototype, 'ping').mockRejectedValue(aDatabaseFailure(DatabaseOperationEnum.QUERY));

        // When / Then
        expect(await request('GET /health')).toEqual({ statusCode: 500, headers: JSON_HEADERS, body: { message: 'Server error.' } });
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
