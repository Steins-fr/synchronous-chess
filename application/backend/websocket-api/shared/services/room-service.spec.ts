import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Room from '@models/room';
import { aRoom, GUEST_CONNECTION, HOST_CONNECTION } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test } from 'vitest';
import RoomService from './room-service';

describe('RoomService', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    let service: RoomService;
    let room: Room;

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        service = new RoomService();
        room = aRoom();
    });

    test('should delete the room when its host disconnects', async () => {
        // When
        await service.removeConnectionFromRoom(room, { connectionId: HOST_CONNECTION, roomName: 'room' });

        // Then
        expect(dynamo.commandCalls(DeleteCommand, { TableName: 'rooms', Key: { id: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    test('should remove a disconnected guest from the queue', async () => {
        // When
        await service.removeConnectionFromRoom(room, { connectionId: GUEST_CONNECTION, roomName: 'room' });

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
        expect(dynamo.commandCalls(DeleteCommand)).toHaveLength(0);
    });

    test('should leave a room without id untouched', async () => {
        // Given
        room = aRoom({ id: undefined });

        // When
        await service.removeConnectionFromRoom(room, { connectionId: GUEST_CONNECTION, roomName: 'room' });

        // Then
        expect(dynamo.calls()).toHaveLength(0);
    });

    test('should get an existing room', async () => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: room });

        // When / Then
        expect(await service.getRoomByName('room')).toEqual(room);
        expect(await service.roomExist('room')).toEqual(true);
    });

    test('should report a missing room', async () => {
        // Given
        dynamo.on(GetCommand).resolves({});

        // When / Then
        await expect(service.getRoomByName('missing')).rejects.toThrow('Room \'missing\' does not exist');
        expect(await service.roomExist('missing')).toEqual(false);
    });

    test('should only let the host edit the room', () => {
        expect(() => service.canEditRoomGuard(room, HOST_CONNECTION)).not.toThrow();
        expect(() => service.canEditRoomGuard(room, GUEST_CONNECTION)).toThrow('You are not the host of the room');
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

    test('should create a room with its host as only player', async () => {
        // When
        await service.create('room', HOST_CONNECTION, 'host', 4);

        // Then
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'rooms',
            Item: { id: 'room', connectionId: HOST_CONNECTION, hostPlayer: 'host', maxPlayer: 4, players: [{ playerName: 'host' }], queue: [] },
        })).toHaveLength(1);
    });

    test('should delete a room', async () => {
        // When
        await service.deleteRoom(room);

        // Then
        expect(dynamo.commandCalls(DeleteCommand, { Key: { id: 'room' } })).toHaveLength(1);
    });
});
