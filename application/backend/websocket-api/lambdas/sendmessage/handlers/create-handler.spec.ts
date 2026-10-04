import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashToken } from '@helpers/token.helper';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { aConditionFailure, anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, HOST_CONNECTION, HOST_TOKEN, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import CreateHandler from './create-handler';

describe('CreateHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const request: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4, token: HOST_TOKEN };

    function create(data: RoomCreateRequest): Promise<void> {
        return new CreateHandler(anApiGatewayClient(), HOST_CONNECTION, aRequest(RoomApiRequestTypeEnum.CREATE, data)).execute();
    }

    test('should create the room of its host, keeping the hash of its token', async () => {
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
                players: [{ playerName: 'host' }],
                queue: [],
                tokenHashes: { host: hashToken(HOST_TOKEN) },
            },
        })).toHaveLength(1);
    });

    test.each([
        ['room name', { ...request, roomName: '' }],
        ['player name', { ...request, playerName: '' }],
        ['player count', { ...request, maxPlayer: 0 }],
        ['token', { ...request, token: '' }],
        ['token of a reasonable length', { ...request, token: 't'.repeat(129) }],
        ['token as a string', { ...request, token: 42 as unknown as string }],
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
