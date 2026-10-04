import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { hashHostToken } from '@helpers/host-token.helper';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { aConditionFailure, anApiGatewayClient, aRequest, AwsMocks, errorReply, HOST_CONNECTION, mockAws, PostedPacket, postedPackets } from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import CreateHandler from './create-handler';

describe('CreateHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const request: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4 };

    function create(data: RoomCreateRequest): Promise<void> {
        return new CreateHandler(anApiGatewayClient(), HOST_CONNECTION, aRequest(RoomApiRequestTypeEnum.CREATE, data)).execute();
    }

    test('should create the room of its host, and give the host its token', async () => {
        // When
        await create(request);

        // Then
        const [reply]: PostedPacket[] = postedPackets(apiGateway);
        const hostToken: string = (reply.packet as { data: { hostToken: string } }).data.hostToken;
        expect(reply).toEqual({ to: HOST_CONNECTION, packet: { id: 7, type: 'created', data: { ...request, hostToken: expect.any(String) } } });
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connections', Item: { connectionId: HOST_CONNECTION, roomName: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(PutCommand, {
            TableName: 'rooms',
            Item: {
                id: 'room',
                connectionId: HOST_CONNECTION,
                hostPlayer: 'host',
                maxPlayer: 4,
                players: [{ playerName: 'host' }],
                queue: [],
                hostTokenHash: hashHostToken(hostToken),
            },
        })).toHaveLength(1);
    });

    test('should give each room its own token', async () => {
        // When
        await create(request);
        await create(request);

        // Then
        const tokens: unknown[] = postedPackets(apiGateway).map(({ packet }: PostedPacket) => (packet as { data: { hostToken: string } }).data.hostToken);
        expect(new Set(tokens).size).toEqual(2);
    });

    test.each([
        ['room name', { ...request, roomName: '' }],
        ['player name', { ...request, playerName: '' }],
        ['player count', { ...request, maxPlayer: 0 }],
    ])('should refuse a request without %s', async (_field: string, data: RoomCreateRequest) => {
        // When / Then
        await expect(create(data)).rejects.toThrow('Payload not valid');
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid')]);
    });

    test('should refuse a room name already taken', async () => {
        // Given: a room of that name, its host connected
        dynamo.on(PutCommand, { TableName: 'rooms' }).rejects(aConditionFailure());

        // When / Then
        await expect(create(request)).rejects.toThrow(RoomApiErrorMessage.ROOM_ALREADY_EXISTS);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.ROOM_ALREADY_EXISTS)]);
    });
});
