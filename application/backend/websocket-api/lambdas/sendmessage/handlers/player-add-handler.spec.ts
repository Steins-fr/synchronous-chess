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
    readRoom,
    storeRoom,
} from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import PlayerAddHandler from './player-add-handler';

describe('PlayerAddHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();

    function add(data: PlayerRequest, connection: string = HOST_CONNECTION): Promise<void> {
        return new PlayerAddHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.PLAYER_ADD, data)).execute();
    }

    beforeEach(async () => {
        await storeRoom(aRoom());
    });

    test('should add a player to the game of the host', async () => {
        // When
        await add({ roomName: 'room', playerName: 'guest' });

        // Then
        expect(await readRoom('room')).toStrictEqual(aRoom({ players: [{ playerName: 'host' }, { playerName: 'guest' }] }));
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { id: 7, type: 'added', data: { roomName: 'room', playerName: 'guest' } } }]);
    });

    test.each([
        ['without room name', { roomName: '', playerName: 'guest' }, HOST_CONNECTION, 'Payload not valid'],
        ['without player', { roomName: 'room', playerName: '' }, HOST_CONNECTION, 'Payload not valid'],
        ['of a player name with the NUL character', { roomName: 'room', playerName: 'guest\u0000' }, HOST_CONNECTION, 'Payload not valid'],
        ['of another player than the host', { roomName: 'room', playerName: 'guest' }, GUEST_CONNECTION, 'You are not the host of the room'],
    ])('should refuse a request %s', async (_case: string, data: PlayerRequest, connection: string, message: string) => {
        // When / Then
        await expect(add(data, connection)).rejects.toThrow(message);
        expect(await readRoom('room')).toStrictEqual(aRoom());
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
