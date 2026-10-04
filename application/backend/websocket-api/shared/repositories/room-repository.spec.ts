import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Room from '@models/room';
import { aConditionFailure, aRoom, GUEST_CONNECTION, HOST_CONNECTION } from '@testing/api-mocks';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, test } from 'vitest';
import RoomRepository from './room-repository';

describe('RoomRepository', () => {
    const dynamo = mockClient(DynamoDBDocumentClient);
    let repository: RoomRepository;
    let room: Room;

    beforeEach(() => {
        // DynamoDB answers every command with an object, empty without data
        dynamo.reset().onAnyCommand().resolves({});
        repository = new RoomRepository();
        room = aRoom();
    });

    test('should get a room by its name', async () => {
        // Given
        dynamo.on(GetCommand).resolves({ Item: room });

        // When
        const found: Room | null = await repository.getByName('room');

        // Then
        expect(found).toEqual(room);
        expect(dynamo.commandCalls(GetCommand, {
            TableName: 'rooms',
            Key: { id: 'room' },
            ProjectionExpression: 'id, connectionId, players, queue, hostPlayer, maxPlayer, hostTokenHash, expiresAt',
        })).toHaveLength(1);
    });

    test('should create a room unless one of that name has its host connected', async () => {
        // When
        const created: boolean = await repository.create(room);

        // Then
        expect(created).toEqual(true);
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'rooms',
            Item: room,
            ConditionExpression: 'attribute_not_exists(id) OR attribute_exists(expiresAt)',
        })).toHaveLength(1);
    });

    test('should not create a room whose name is taken', async () => {
        // Given
        dynamo.on(PutCommand).rejects(aConditionFailure());

        // When / Then
        expect(await repository.create(room)).toEqual(false);
    });

    test('should let a room wait for its host, unless the host moved it to another connection', async () => {
        // When
        await repository.waitForHost(room, HOST_CONNECTION, 1000);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            Key: { id: 'room' },
            UpdateExpression: 'SET expiresAt = :expiresAt',
            ConditionExpression: 'connectionId = :hostConnectionId',
            ExpressionAttributeValues: { ':expiresAt': 1000, ':hostConnectionId': HOST_CONNECTION },
        })).toHaveLength(1);
    });

    test('should leave a room its host already moved to another connection', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(repository.waitForHost(room, HOST_CONNECTION, 1000)).resolves.toBeUndefined();
    });

    test('should move a room to another connection of its host, with the hash of its token, before it expires', async () => {
        // When
        const reconnected: boolean = await repository.reconnectHost(room, 'new-connection', 'hash', 500);

        // Then
        expect(reconnected).toEqual(true);
        expect(dynamo.commandCalls(UpdateCommand, {
            Key: { id: 'room' },
            UpdateExpression: 'SET connectionId = :connectionId REMOVE expiresAt',
            ConditionExpression: 'hostTokenHash = :hostTokenHash AND (attribute_not_exists(expiresAt) OR expiresAt > :now)',
            ExpressionAttributeValues: { ':connectionId': 'new-connection', ':hostTokenHash': 'hash', ':now': 500 },
        })).toHaveLength(1);
    });

    test('should not move a room for another token, or once expired', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        expect(await repository.reconnectHost(room, 'new-connection', 'hash', 500)).toEqual(false);
    });

    test('should append a player to the room', async () => {
        // When
        await repository.addPlayerToRoom({ playerName: 'guest' }, room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            Key: { id: 'room' },
            UpdateExpression: 'set players = list_append(players, :items)',
            ExpressionAttributeValues: { ':items': [{ playerName: 'guest' }] },
        })).toHaveLength(1);
    });

    test('should remove a player from the room by its index', async () => {
        // Given
        room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'guest' }] });

        // When
        await repository.removePlayerFromRoom('guest', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { Key: { id: 'room' }, UpdateExpression: 'REMOVE players[1]' })).toHaveLength(1);
    });

    test('should not remove a player out of the room', async () => {
        // When / Then
        await expect(repository.removePlayerFromRoom('unknown', room)).rejects.toThrow('Player not in the room');
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    test('should append a player to the queue', async () => {
        // When
        await repository.addPlayerToQueue({ playerName: 'other', connectionId: 'other-connection' }, room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            Key: { id: 'room' },
            UpdateExpression: 'set queue = list_append(queue, :items)',
            ExpressionAttributeValues: { ':items': [{ playerName: 'other', connectionId: 'other-connection' }] },
        })).toHaveLength(1);
    });

    test('should remove a player from the queue by the index of its connection', async () => {
        // When
        await repository.removePlayerFromQueue(GUEST_CONNECTION, room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { Key: { id: 'room' }, UpdateExpression: 'REMOVE queue[0]' })).toHaveLength(1);
    });

    test('should not remove a connection out of the queue', async () => {
        // When / Then
        await expect(repository.removePlayerFromQueue('unknown', room)).rejects.toThrow('Player not in the queue');
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
    });
});
