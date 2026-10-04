import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashHostToken } from '@helpers/host-token.helper';
import Room from '@models/room';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { aConditionFailure, aRoom, GUEST_CONNECTION, HOST_CONNECTION, HOST_TOKEN } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RoomService from './room-service';

describe('RoomService', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    let service: RoomService;
    let room: Room;

    // In epoch seconds
    const now: number = 1_800_000_000;

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        vi.useFakeTimers({ now: now * 1000 });
        service = new RoomService();
        room = aRoom();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should let the room wait for its host when the host disconnects', async () => {
        // When
        await service.removeConnectionFromRoom(room, { connectionId: HOST_CONNECTION, roomName: 'room' });

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            TableName: 'room',
            UpdateExpression: 'SET expiresAt = :expiresAt',
            ExpressionAttributeValues: { ':expiresAt': now + 600, ':hostConnectionId': HOST_CONNECTION },
        })).toHaveLength(1);
    });

    test('should remove a disconnected guest from the queue', async () => {
        // When
        await service.removeConnectionFromRoom(room, { connectionId: GUEST_CONNECTION, roomName: 'room' });

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(1);
    });

    test('should leave the room of a connection neither its host nor queued', async () => {
        // When: a former connection of the host
        await service.removeConnectionFromRoom(room, { connectionId: 'former-host-connection', roomName: 'room' });

        // Then
        expect(dynamo.calls()).toHaveLength(0);
    });

    test.each([
        ['with its host connected', aRoom()],
        ['waiting for its host', aRoom({ expiresAt: now + 1 })],
    ])('should get an existing room %s', async (_case: string, existing: Room) => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: existing });

        // When / Then
        expect(await service.getRoomByName('room')).toEqual(existing);
    });

    test.each([
        ['missing', undefined],
        ['expired', aRoom({ expiresAt: now })],
    ])('should report a %s room', async (_case: string, item: Room | undefined) => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: item });

        // When / Then
        await expect(service.getRoomByName('room')).rejects.toThrow('Room \'room\' does not exist');
    });

    test('should only let the host edit the room', () => {
        expect(() => service.canEditRoomGuard(room, HOST_CONNECTION)).not.toThrow();
        expect(() => service.canEditRoomGuard(room, GUEST_CONNECTION)).toThrow('You are not the host of the room');
    });

    test('should only reach the host of a room while connected', () => {
        expect(() => service.hostConnectedGuard(room)).not.toThrow();
        expect(() => service.hostConnectedGuard(aRoom({ expiresAt: now + 1 }))).toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
    });

    test('should add and remove the players of the room', async () => {
        // When
        await service.addPlayerToRoom('guest', room);
        await service.removePlayerFromRoom('host', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { ExpressionAttributeValues: { ':items': [{ playerName: 'guest' }] } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: 'REMOVE players[0]' })).toHaveLength(1);
    });

    test('should queue a player with its connection', async () => {
        // When
        await service.addPlayerToQueue('other', 'other-connection', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            UpdateExpression: 'set queue = list_append(queue, :items)',
            ExpressionAttributeValues: { ':items': [{ playerName: 'other', connectionId: 'other-connection' }] },
        })).toHaveLength(1);
    });

    test('should create a room with its host as only player, keeping the hash of the token it returns', async () => {
        // When
        const hostToken: string = await service.create('room', HOST_CONNECTION, 'host', 4);

        // Then
        expect(hostToken).toMatch(/^[\w-]{43}$/);
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'room',
            Item: {
                id: 'room',
                connectionId: HOST_CONNECTION,
                hostPlayer: 'host',
                maxPlayer: 4,
                players: [{ playerName: 'host' }],
                queue: [],
                hostTokenHash: hashHostToken(hostToken),
            },
            ExpressionAttributeValues: { ':now': now },
        })).toHaveLength(1);
    });

    test('should refuse to create a room whose name is taken', async () => {
        // Given
        dynamo.on(PutCommand).rejects(aConditionFailure());

        // When / Then
        await expect(service.create('room', HOST_CONNECTION, 'host', 4)).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
    });

    test('should move a room to another connection of its host', async () => {
        // When
        await service.reconnectHost(room, 'new-connection', HOST_TOKEN);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            ExpressionAttributeValues: { ':connectionId': 'new-connection', ':hostTokenHash': hashHostToken(HOST_TOKEN), ':now': now },
        })).toHaveLength(1);
    });

    test('should refuse to move a room for another token than its host\'s', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(service.reconnectHost(room, 'new-connection', 'other-token')).rejects.toThrow('You are not the host of the room');
    });
});
