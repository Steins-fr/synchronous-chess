import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashHostToken } from '@helpers/host-token.helper';
import RoomReconnectRequest from '@protocol/requests/room-reconnect-request';
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
        await reconnect({ roomName: 'room', hostToken: HOST_TOKEN });

        // Then
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connection', Item: { connectionId: connection, roomName: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand).map(({ args: [command] }: { args: [UpdateCommand] }) => command.input)).toEqual([expect.objectContaining({
            TableName: 'room',
            Key: { id: 'room' },
            UpdateExpression: 'SET connectionId = :connectionId REMOVE expiresAt',
            ExpressionAttributeValues: { ':connectionId': connection, ':hostTokenHash': hashHostToken(HOST_TOKEN), ':now': expect.any(Number) },
        })]);
        expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'reconnected', data: { roomName: 'room' } } }]);
    });

    test('should refuse another token than the host\'s', async () => {
        // Given: the token hash does not match in DynamoDB
        dynamo.on(UpdateCommand).rejects(aConditionFailure());

        // When / Then
        await expect(reconnect({ roomName: 'room', hostToken: 'other-token' })).rejects.toThrow('You are not the host of the room');
        expect(postedPackets(apiGateway)).toEqual([errorReply('You are not the host of the room', connection)]);
    });

    test.each([
        ['room name', { roomName: '', hostToken: HOST_TOKEN }, 'Payload not valid'],
        ['token', { roomName: 'room', hostToken: '' }, 'Payload not valid'],
        ['token not a string', { roomName: 'room', hostToken: 42 as unknown as string }, 'Payload not valid'],
        ['room missing', { roomName: 'missing', hostToken: HOST_TOKEN }, 'Room \'missing\' does not exist'],
    ])('should refuse a request with its %s', async (_case: string, data: RoomReconnectRequest, message: string) => {
        // When / Then
        await expect(reconnect(data)).rejects.toThrow(message);
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
