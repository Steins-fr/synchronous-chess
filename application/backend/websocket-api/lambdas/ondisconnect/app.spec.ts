import { PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import DatabaseException, { DatabaseOperationEnum } from '@exceptions/database-exception';
import Player from '@models/player';
import Room from '@models/room';
import ConnectionRepository from '@repositories/connection-repository';
import RoomRepository from '@repositories/room-repository';
import RoomService from '@services/room-service';
import {
    aDatabaseFailure,
    aRoom,
    AwsMocks,
    anEvent,
    GUEST_CONNECTION,
    HOST_CONNECTION,
    mockAws,
    postedPackets,
    readConnections,
    readRoom,
    storeConnection,
    storeRoom,
} from '@testing/api-mocks';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { handler } from './app';

// In epoch seconds
const NOW: number = 1_800_000_000;

describe('ondisconnect lambda', () => {
    const { apiGateway }: AwsMocks = mockAws();

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should remove a disconnected guest from the queue, then its connection', async () => {
        // Given
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(await readRoom('room')).toStrictEqual(aRoom({ queue: [] }));
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'room' }]);
    });

    test('should tell the host a guest waiting to join left, before the guest leaves the queue', async () => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());
        const queuesWhenNotified: Player[][] = [];
        apiGateway.on(PostToConnectionCommand).callsFake(async (): Promise<object> => {
            queuesWhenNotified.push((await readRoom('room'))?.queue ?? []);
            return {};
        });

        // When
        await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { type: 'joinCancelled', data: { playerName: 'guest' } } }]);
        expect(queuesWhenNotified).toEqual([[{ playerName: 'guest', connectionId: GUEST_CONNECTION }]]);
        expect((await readRoom('room'))?.queue).toEqual([]);
    });

    test.each([
        ['a player of the room, which closed its socket once connected', { players: [{ playerName: 'host' }, { playerName: 'guest' }] }],
        ['a guest of a room waiting for its host', { expiresAt: Math.floor(Date.now() / 1000) + 600 }],
    ])('should not tell the host of %s', async (_case: string, state: Partial<Room>) => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom(state));

        // When
        await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(postedPackets(apiGateway)).toEqual([]);
        expect(await readRoom('room')).toStrictEqual(aRoom({ ...state, queue: [] }));
    });

    test('should remove the guest from the queue even when the host can not be told', async () => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());
        const failure: Error = new Error('Gone');
        apiGateway.on(PostToConnectionCommand).rejects(failure);

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(console.error).toHaveBeenCalledWith(failure);
        expect((await readRoom('room'))?.queue).toEqual([]);
    });

    test('should let the room of a disconnected host wait for it', async () => {
        // Given
        vi.useFakeTimers({ now: NOW * 1000, toFake: ['Date'] });
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());

        // When
        const response = await handler(anEvent(HOST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(await readRoom('room')).toStrictEqual(aRoom({ expiresAt: NOW + RoomService.HOST_RECONNECTION_DELAY }));
        expect(postedPackets(apiGateway)).toEqual([]);
        expect(await readConnections()).toEqual([]);
    });

    test('should only delete a connection the room no longer has', async () => {
        // Given: a former connection of the host, which reconnected the room to another one
        await storeConnection({ connectionId: 'former-host-connection', roomName: 'room' });
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());
        const waitForHost = vi.spyOn(RoomRepository.prototype, 'waitForHost');

        // When
        const response = await handler(anEvent('former-host-connection'));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(waitForHost).not.toHaveBeenCalled();
        expect(await readRoom('room')).toStrictEqual(aRoom());
        expect(await readConnections()).toEqual([{ connectionId: GUEST_CONNECTION, roomName: 'room' }]);
    });

    test('should delete the connection even when it can not leave its room', async () => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());
        const failure: DatabaseException = aDatabaseFailure();
        vi.spyOn(RoomRepository.prototype, 'removePlayerFromQueue').mockRejectedValue(failure);

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(console.error).toHaveBeenCalledWith(failure);
        expect(await readConnections()).toEqual([]);
    });

    test('should delete the connection of a room which no longer exists, or expired', async () => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'missing' });

        // When
        const response = await handler(anEvent(GUEST_CONNECTION));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Closed' });
        expect(await readConnections()).toEqual([]);
    });

    test('should fail when the connection can not be deleted', async () => {
        // Given
        await storeConnection({ connectionId: GUEST_CONNECTION, roomName: 'room' });
        await storeRoom(aRoom());
        const failure: DatabaseException = aDatabaseFailure(DatabaseOperationEnum.DELETE);
        vi.spyOn(ConnectionRepository.prototype, 'delete').mockRejectedValue(failure);

        // When / Then
        expect(await handler(anEvent(GUEST_CONNECTION))).toEqual({ statusCode: 500, body: 'Internal server error' });
        expect(console.error).toHaveBeenCalledWith(failure);
    });

    test('should fail without connection id', async () => {
        expect(await handler(anEvent(undefined))).toEqual({ statusCode: 500, body: 'Undefined connection' });
    });

    test('should fail for an unknown connection', async () => {
        // Given
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });

        // When / Then
        expect(await handler(anEvent(GUEST_CONNECTION))).toEqual({ statusCode: 500, body: 'Undefined connection' });
        expect(await readConnections()).toEqual([{ connectionId: HOST_CONNECTION, roomName: 'room' }]);
    });
});
