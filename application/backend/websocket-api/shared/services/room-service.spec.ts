import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashPassword } from '@helpers/password.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomGame } from '@protocol/room-game.enum';
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
    const createRequest: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4, game: RoomGame.CHAT, token: HOST_TOKEN };

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

    test('should let the host reconnect its room, and a player of the room take it over from a disconnected host', () => {
        // Given
        const players = [{ playerName: 'host' }, { playerName: 'player' }];

        // When / Then
        expect(() => service.reconnectHostGuard(room, 'host')).not.toThrow();
        expect(() => service.reconnectHostGuard(aRoom({ players, expiresAt: now + 1 }), 'player')).not.toThrow();
        expect(() => service.reconnectHostGuard(aRoom({ players }), 'player')).toThrow(RoomApiErrorMessage.HOST_CONNECTED);
        expect(() => service.reconnectHostGuard(aRoom({ expiresAt: now + 1 }), 'guest')).toThrow('You are not the host of the room');
    });

    test('should only reach the host of a room while connected', () => {
        expect(() => service.hostConnectedGuard(room)).not.toThrow();
        expect(() => service.hostConnectedGuard(aRoom({ expiresAt: now + 1 }))).toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
    });

    test('should list the open rooms of a game by name, the full ones left out', async () => {
        // Given
        dynamo.on(ScanCommand).resolves({
            Items: [
                aRoom({ id: 'zebra', maxPlayer: 4, players: [{ playerName: 'host' }, { playerName: 'guest' }], passwordHash: hashPassword('secret') }),
                aRoom({ id: 'full', maxPlayer: 1 }),
                aRoom({ id: 'alpha', hostPlayer: 'alice' }),
            ],
        });

        // When / Then
        expect(await service.getOpenRooms(RoomGame.CHESS)).toEqual([
            { roomName: 'alpha', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false },
            { roomName: 'zebra', hostPlayer: 'host', playerCount: 2, maxPlayer: 4, isPrivate: true },
        ]);
        expect(dynamo.commandCalls(ScanCommand, { ExpressionAttributeValues: { ':game': RoomGame.CHESS } })).toHaveLength(1);
    });

    test('should list a limited count of open rooms', async () => {
        // Given
        const rooms: Room[] = Array.from({ length: RoomService.MAX_OPEN_ROOMS + 1 }, (_room: unknown, index: number) => aRoom({ id: `room-${ index }` }));
        dynamo.on(ScanCommand).resolves({ Items: rooms });

        // When / Then
        expect(await service.getOpenRooms(RoomGame.CHESS)).toHaveLength(RoomService.MAX_OPEN_ROOMS);
    });

    test('should let a player join a private room with its password only', () => {
        // Given
        const privateRoom: Room = aRoom({ passwordHash: hashPassword('secret') });

        // When / Then
        expect(() => service.passwordGuard(privateRoom, 'secret')).not.toThrow();
        expect(() => service.passwordGuard(privateRoom, 'wrong')).toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(() => service.passwordGuard(privateRoom, undefined)).toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(() => service.passwordGuard(privateRoom, 42 as unknown as string)).toThrow(RoomApiErrorMessage.WRONG_PASSWORD);
        expect(() => service.passwordGuard(room, undefined)).not.toThrow();
        expect(() => service.passwordGuard(room, 'any')).not.toThrow();
    });

    test('should add and remove the players of the room', async () => {
        // When
        await service.addPlayerToRoom('guest', room);
        await service.removePlayerFromRoom('host', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, { ExpressionAttributeValues: { ':items': [{ playerName: 'guest' }] } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand, { UpdateExpression: 'REMOVE players[0], tokenHashes.#playerName' })).toHaveLength(1);
    });

    test('should not add a player twice to the room', async () => {
        // When
        await service.addPlayerToRoom('host', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    test('should queue a player with its connection, and the hash of its token', async () => {
        // When
        await service.addPlayerToQueue('other', 'other-connection', 'other-token', room);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            ExpressionAttributeValues: { ':items': [{ playerName: 'other', connectionId: 'other-connection' }], ':tokenHash': hashToken('other-token') },
        })).toHaveLength(1);
    });

    test('should create a room with its host as only player, keeping the hash of its token', async () => {
        // When
        await service.create(createRequest, HOST_CONNECTION);

        // Then
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'room',
            Item: {
                id: 'room',
                connectionId: HOST_CONNECTION,
                hostPlayer: 'host',
                maxPlayer: 4,
                game: RoomGame.CHAT,
                players: [{ playerName: 'host' }],
                queue: [],
                tokenHashes: { host: hashToken(HOST_TOKEN) },
            },
            ExpressionAttributeValues: { ':now': now },
        })).toHaveLength(1);
    });

    test('should refuse to create a room whose name is taken', async () => {
        // Given
        dynamo.on(PutCommand).rejects(aConditionFailure());

        // When / Then
        await expect(service.create(createRequest, HOST_CONNECTION)).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
    });

    test('should move a room to another connection of its host', async () => {
        // When
        await service.reconnectHost(room, 'new-connection', 'host', HOST_TOKEN);

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            ExpressionAttributeValues: { ':connectionId': 'new-connection', ':playerName': 'host', ':tokenHash': hashToken(HOST_TOKEN), ':now': now },
        })).toHaveLength(1);
    });

    test('should refuse to move a room for another token than its host\'s', async () => {
        // Given
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(service.reconnectHost(room, 'new-connection', 'host', 'other-token')).rejects.toThrow('You are not the host of the room');
    });
});
