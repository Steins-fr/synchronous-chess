import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyPassword } from '@helpers/password.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { RoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { aConditionFailure, anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, HOST_CONNECTION, HOST_TOKEN, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { afterEach, describe, expect, test, vi } from 'vitest';
import CreateHandler from './create-handler';

describe('CreateHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const request: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4, game: RoomGame.CHESS, token: HOST_TOKEN };

    function create(data: RoomCreateRequest): Promise<void> {
        return new CreateHandler(anApiGatewayClient(), HOST_CONNECTION, aRequest(RoomApiRequestTypeEnum.CREATE, data)).execute();
    }

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should create the room of its host, keeping the hash of its token and its creation date', async () => {
        // Given
        vi.useFakeTimers({ now: new Date('2026-10-11T12:00:00.000Z'), toFake: ['Date'] });

        // When
        await create(request);

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { id: 7, type: 'created', data: { roomName: 'room', playerName: 'host', maxPlayer: 4 } } },
        ]);
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connection', Item: { connectionId: HOST_CONNECTION, roomName: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'room',
            Item: {
                id: 'room',
                connectionId: HOST_CONNECTION,
                hostPlayer: 'host',
                maxPlayer: 4,
                game: RoomGame.CHESS,
                createdAt: '2026-10-11T12:00:00.000Z',
                players: [{ playerName: 'host' }],
                queue: [],
                tokenHashes: { host: hashToken(HOST_TOKEN) },
            },
        })).toHaveLength(1);
    });

    test('should create a private room, keeping a hash of its password', async () => {
        // When
        await create({ ...request, password: 'secret' });

        // Then
        const [{ args: [command] }] = dynamo.commandCalls(PutCommand, { TableName: 'room' });
        const room = command.input.Item as Room;
        expect(room.passwordHash).not.toContain('secret');
        expect(verifyPassword('secret', room.passwordHash as string)).toEqual(true);
    });

    test.each([
        ['room name', { ...request, roomName: '' }],
        ['room name of other characters than spaces', { ...request, roomName: '   ' }],
        ['room name of a reasonable length', { ...request, roomName: 'r'.repeat(33) }],
        ['player name of a reasonable length', { ...request, playerName: 'p'.repeat(33) }],
        ['player name', { ...request, playerName: '' }],
        ['player count', { ...request, maxPlayer: 0 }],
        ['player count of a reasonable size', { ...request, maxPlayer: 17 }],
        ['whole player count', { ...request, maxPlayer: 2.5 }],
        ['player count as a number', { ...request, maxPlayer: 'p'.repeat(1000) as unknown as number }],
        ['token', { ...request, token: '' }],
        ['token of a reasonable length', { ...request, token: 't'.repeat(129) }],
        ['token as a string', { ...request, token: 42 as unknown as string }],
        ['known game', { ...request, game: 'go' as RoomGame }],
        ['password not empty', { ...request, password: '' }],
        ['password of a reasonable length', { ...request, password: 'p'.repeat(129) }],
    ])('should refuse a request without %s', async (_field: string, data: RoomCreateRequest) => {
        // When / Then
        await expect(create(data)).rejects.toThrow('Payload not valid');
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid')]);
    });

    test('should create a room on a connection whose creation of another room was refused', async () => {
        // Given
        dynamo.on(GetCommand, { TableName: 'connection' }).resolves({ Item: { connectionId: HOST_CONNECTION, roomName: 'taken' } });
        storeRoom(dynamo, aRoom({ id: 'taken', connectionId: 'other-connection' }));

        // When
        await create(request);

        // Then
        expect(dynamo.commandCalls(PutCommand, { TableName: 'room' })).toHaveLength(1);
    });

    test('should refuse to create a room on the connection of another room it hosts', async () => {
        // Given
        dynamo.on(GetCommand, { TableName: 'connection' }).resolves({ Item: { connectionId: HOST_CONNECTION, roomName: 'hosted' } });
        storeRoom(dynamo, aRoom({ id: 'hosted' }));

        // When / Then
        await expect(create(request)).rejects.toThrow('Already hosting a room');
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
    });

    test('should refuse a room name already taken', async () => {
        // Given: a room of that name, its host connected
        dynamo.on(PutCommand, { TableName: 'room' }).rejects(aConditionFailure());

        // When / Then
        await expect(create(request)).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.ROOM_ALREADY_EXISTS)]);
    });
});
