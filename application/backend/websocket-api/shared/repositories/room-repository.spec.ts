import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import Room from '@models/room';
import { aRoom, GUEST_CONNECTION } from '@testing/api-mocks';
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
            ProjectionExpression: 'id, connectionId, players, queue, hostPlayer, maxPlayer',
        })).toHaveLength(1);
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
