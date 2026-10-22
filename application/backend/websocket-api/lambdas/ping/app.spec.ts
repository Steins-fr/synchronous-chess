import RoomService from '@services/room-service';
import { aDatabaseFailure, anEvent, aRoom, HOST_CONNECTION, mockAws, readRoom, storeConnection, storeRoom } from '@testing/api-mocks';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handler } from './app';

const NOW: number = 1_800_000_000;

describe('ping lambda', () => {
    mockAws();

    beforeEach(() => {
        vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should renew the lease of the room the connection hosts, a statement which keeps the database awake', async () => {
        // Given
        await storeRoom(aRoom({ leaseUntil: NOW + 1 }));
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });

        // When
        const response = await handler(anEvent(HOST_CONNECTION, '{"message":"ping"}'));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Awake' });
        expect((await readRoom('room'))?.leaseUntil).toBe(NOW + RoomService.LEASE);
    });

    test('should answer a server error without connection', async () => {
        // When
        const response = await handler(anEvent(undefined));

        // Then
        expect(response).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });

    test('should answer a server error once the database fails', async () => {
        // Given
        const failure = aDatabaseFailure();
        vi.spyOn(RoomService.prototype, 'renewLease').mockRejectedValue(failure);

        // When
        const response = await handler(anEvent(HOST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 500, body: 'Internal server error' });
        expect(console.error).toHaveBeenCalledWith(failure);
    });
});
