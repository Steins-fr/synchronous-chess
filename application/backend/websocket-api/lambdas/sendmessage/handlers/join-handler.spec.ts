import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { hashToken } from '@helpers/token.helper';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, HOST_CONNECTION, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import JoinHandler from './join-handler';

describe('JoinHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const connection: string = 'other-connection';

    function join(data: RoomJoinRequest): Promise<void> {
        return new JoinHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.JOIN, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom());
    });

    test('should queue the player and ask the host', async () => {
        // When
        await join({ roomName: 'room', playerName: 'other', token: 'other-token' });

        // Then
        expect(dynamo.commandCalls(PutCommand, { TableName: 'connection', Item: { connectionId: connection, roomName: 'room' } })).toHaveLength(1);
        expect(dynamo.commandCalls(UpdateCommand, {
            UpdateExpression: 'set queue = list_append(queue, :items), tokenHashes.#playerName = :tokenHash',
            ExpressionAttributeValues: { ':items': [{ playerName: 'other', connectionId: connection }], ':tokenHash': hashToken('other-token') },
            ExpressionAttributeNames: { '#playerName': 'other' },
        })).toHaveLength(1);
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { type: 'joinRequest', data: { playerName: 'other' } } },
            { to: connection, packet: { id: 7, type: 'joiningRoom', data: { playerName: 'host' } } },
        ]);
    });

    test.each([
        ['room name', { roomName: '', playerName: 'other', token: 'other-token' }, 'Payload not valid'],
        ['player name', { roomName: 'room', playerName: '', token: 'other-token' }, 'Payload not valid'],
        ['token', { roomName: 'room', playerName: 'other', token: '' }, 'Payload not valid'],
        ['player in the game', { roomName: 'room', playerName: 'host', token: 'other-token' }, RoomApiErrorMessage.ALREADY_IN_GAME],
        ['player in the queue', { roomName: 'room', playerName: 'guest', token: 'other-token' }, RoomApiErrorMessage.ALREADY_IN_QUEUE],
        ['room missing', { roomName: 'missing', playerName: 'other', token: 'other-token' }, 'Room \'missing\' does not exist'],
    ])('should refuse a request with its %s', async (_case: string, data: RoomJoinRequest, message: string) => {
        // When / Then
        await expect(join(data)).rejects.toThrow(message);
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });

    test('should refuse to queue a player while the host is disconnected', async () => {
        // Given
        storeRoom(dynamo, aRoom({ expiresAt: Math.floor(Date.now() / 1000) + 60 }));

        // When / Then
        await expect(join({ roomName: 'room', playerName: 'other', token: 'other-token' })).rejects.toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
        expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply(RoomApiErrorMessage.HOST_DISCONNECTED, connection)]);
    });
});
