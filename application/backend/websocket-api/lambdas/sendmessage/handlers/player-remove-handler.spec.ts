import Room from '@models/room';
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
import PlayerRemoveHandler from './player-remove-handler';

describe('PlayerRemoveHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'player' }] });

    function remove(data: PlayerRequest, connection: string = HOST_CONNECTION): Promise<void> {
        return new PlayerRemoveHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.PLAYER_REMOVE, data)).execute();
    }

    beforeEach(async () => {
        await storeRoom(room);
    });

    test('should remove a player from the game of the host', async () => {
        // When
        await remove({ roomName: 'room', playerName: 'player' });

        // Then
        expect(await readRoom('room')).toStrictEqual({ ...room, players: [{ playerName: 'host' }] });
        expect(postedPackets(apiGateway)).toEqual([{ to: HOST_CONNECTION, packet: { id: 7, type: 'removed', data: { roomName: 'room', playerName: 'player' } } }]);
    });

    test.each([
        ['without room name', { roomName: '', playerName: 'player' }, HOST_CONNECTION, 'Payload not valid'],
        ['without player', { roomName: 'room', playerName: '' }, HOST_CONNECTION, 'Payload not valid'],
        ['of another player than the host', { roomName: 'room', playerName: 'player' }, GUEST_CONNECTION, 'You are not the host of the room'],
        ['of a player out of the game', { roomName: 'room', playerName: 'guest' }, HOST_CONNECTION, 'Player not found'],
    ])('should refuse a request %s', async (_case: string, data: PlayerRequest, connection: string, message: string) => {
        // When / Then
        await expect(remove(data, connection)).rejects.toThrow(message);
        expect(await readRoom('room')).toStrictEqual(room);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
