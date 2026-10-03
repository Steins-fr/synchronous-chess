import PlayersRequest from '@protocol/requests/players-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, GUEST_CONNECTION, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import PlayerGetAllHandler from './player-get-all-handler';

describe('PlayerGetAllHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();

    function getAll(data: PlayersRequest): Promise<void> {
        return new PlayerGetAllHandler(anApiGatewayClient(), GUEST_CONNECTION, aRequest(RoomApiRequestTypeEnum.PLAYER_GET_ALL, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom({ players: [{ playerName: 'host' }, { playerName: 'player' }] }));
    });

    test('should reply the players in the game, not the queued ones', async () => {
        // When
        await getAll({ roomName: 'room' });

        // Then
        expect(postedPackets(apiGateway)).toEqual([{ to: GUEST_CONNECTION, packet: { id: 7, type: 'players', data: { players: ['host', 'player'] } } }]);
    });

    test('should refuse a request without room name', async () => {
        // When / Then
        await expect(getAll({ roomName: '' })).rejects.toThrow('Payload not valid');
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid', GUEST_CONNECTION)]);
    });
});
