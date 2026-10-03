import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import PlayerRequest from '@protocol/requests/player-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import {
    anApiGatewayClient,
    aRequest,
    aRoom,
    AwsMocks,
    errorReply,
    GUEST_CONNECTION,
    HOST_CONNECTION,
    mockAws,
    postedPackets,
    storeRoom,
} from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import PlayerAddHandler from './player-add-handler';

describe('PlayerAddHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();

    function add(data: PlayerRequest, connection: string = HOST_CONNECTION): Promise<void> {
        return new PlayerAddHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.PLAYER_ADD, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom());
    });

    test('should add a player to the game of the host', async () => {
        // When
        await add({ roomName: 'room', playerName: 'guest' });

        // Then
        expect(dynamo.commandCalls(UpdateCommand, {
            UpdateExpression: 'set players = list_append(players, :items)',
            ExpressionAttributeValues: { ':items': [{ playerName: 'guest' }] },
        })).toHaveLength(1);
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { id: 7, type: 'added', data: { roomName: 'room', playerName: 'guest' } } }]);
    });

    test.each([
        ['without room name', { roomName: '', playerName: 'guest' }, HOST_CONNECTION, 'Payload not valid'],
        ['without player', { roomName: 'room', playerName: '' }, HOST_CONNECTION, 'Payload not valid'],
        ['of another player than the host', { roomName: 'room', playerName: 'guest' }, GUEST_CONNECTION, 'You are not the host of the room'],
    ])('should refuse a request %s', async (_case: string, data: PlayerRequest, connection: string, message: string) => {
        // When / Then
        await expect(add(data, connection)).rejects.toThrow(message);
        expect(dynamo.commandCalls(UpdateCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
