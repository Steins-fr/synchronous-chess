import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import RoomReconnectRequest from '@protocol/requests/room-reconnect-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import {
    aConditionFailure,
    anApiGatewayClient,
    aRequest,
    aRoom,
    AwsMocks,
    errorReply,
    HOST_TOKEN,
    mockAws,
    postedPackets,
    storeRoom,
} from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import ReconnectHandler from './reconnect-handler';

describe('ReconnectHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const connection: string = 'new-host-connection';

    function reconnect(data: RoomReconnectRequest): Promise<void> {
        return new ReconnectHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.RECONNECT, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom());
    });

    test('should move the room to the new connection of its host', async () => {
        // When
        await reconnect({ roomName: 'room', playerName: 'host', token: HOST_TOKEN });

        // Then
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connection', Item: { connectionId: connection, roomName: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand).map(({ args: [command] }: { args: [UpdateCommand] }) => command.input)).toEqual([expect.objectContaining({
            TableName: 'room',
            Key: { id: 'room' },
            UpdateExpression: 'SET connectionId = :connectionId, hostPlayer = :playerName REMOVE expiresAt',
            ExpressionAttributeValues: { ':connectionId': connection, ':playerName': 'host', ':tokenHash': hashToken(HOST_TOKEN), ':now': expect.any(Number) },
            ExpressionAttributeNames: { '#playerName': 'host' },
        })]);
        expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'reconnected', data: { roomName: 'room' } } }]);
    });

    test('should refuse another token than the host\'s', async () => {
        // Given: the token hash does not match in DynamoDB
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(reconnect({ roomName: 'room', playerName: 'host', token: 'other-token' })).rejects.toThrow('You are not the host of the room');
        expect(postedPackets(apiGateway)).toEqual([errorReply('You are not the host of the room', connection)]);
    });

    describe('a player taking over', () => {
        const players = [{ playerName: 'host' }, { playerName: 'player' }];

        test('should move the room waiting for its host to the connection of a player of the room, its new host', async () => {
            // Given
            storeRoom(dynamo, aRoom({ players, expiresAt: Math.floor(Date.now() / 1000) + 60 }));

            // When
            await reconnect({ roomName: 'room', playerName: 'player', token: 'player-token' });

            // Then
            expect(dynamo.commandCalls(UpdateCommand).map(({ args: [command] }: { args: [UpdateCommand] }) => command.input)).toEqual([expect.objectContaining({
                ExpressionAttributeValues: { ':connectionId': connection, ':playerName': 'player', ':tokenHash': hashToken('player-token'), ':now': expect.any(Number) },
                ExpressionAttributeNames: { '#playerName': 'player' },
            })]);
            expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'reconnected', data: { roomName: 'room' } } }]);
        });

        test.each([
            ['while the host is connected', aRoom({ players }), 'player', RoomApiErrorMessage.HOST_CONNECTED],
            ['out of the room, even queued', aRoom({ players, expiresAt: Math.floor(Date.now() / 1000) + 60 }), 'guest', 'You are not the host of the room'],
        ])('should refuse a player %s', async (_case: string, room: Room, playerName: string, message: string) => {
            // Given
            storeRoom(dynamo, room);

            // When / Then
            await expect(reconnect({ roomName: 'room', playerName, token: 'player-token' })).rejects.toThrow(message);
            expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
            expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
            expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
        });
    });

    test.each([
        ['room name', { roomName: '', playerName: 'host', token: HOST_TOKEN }, 'Payload not valid'],
        ['player name', { roomName: 'room', playerName: '', token: HOST_TOKEN }, 'Payload not valid'],
        ['token', { roomName: 'room', playerName: 'host', token: '' }, 'Payload not valid'],
        ['room missing', { roomName: 'missing', playerName: 'host', token: HOST_TOKEN }, 'Room \'missing\' does not exist'],
    ])('should refuse a request with its %s', async (_case: string, data: RoomReconnectRequest, message: string) => {
        // When / Then
        await expect(reconnect(data)).rejects.toThrow(message);
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
