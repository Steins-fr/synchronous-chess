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
    readBanned,
    readRoom,
    storeRoom,
} from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import BanHandler from './ban-handler';

describe('BanHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'player' }], tokenHashes: { ...aRoom().tokenHashes, player: 'player-hash' } });

    function ban(data: PlayerRequest, connection: string = HOST_CONNECTION): Promise<void> {
        return new BanHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.BAN, data)).execute();
    }

    beforeEach(async () => {
        await storeRoom(room);
    });

    test('should ban a player of the room for its host, once, the room unchanged', async () => {
        // When
        await ban({ roomName: 'room', playerName: 'player' });
        await ban({ roomName: 'room', playerName: 'player' });

        // Then: the host removes it from the game once the room agreed it left
        expect(await readBanned('room')).toEqual(['player']);
        expect(await readRoom('room')).toStrictEqual(room);
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { id: 7, type: 'banned', data: { playerName: 'player' } } },
            { to: HOST_CONNECTION, packet: { id: 7, type: 'banned', data: { playerName: 'player' } } },
        ]);
    });

    test('should ban a player waiting in the queue, a name without token changing nothing', async () => {
        // When
        await ban({ roomName: 'room', playerName: 'guest' });
        await ban({ roomName: 'room', playerName: 'nobody' });

        // Then
        expect(await readBanned('room')).toEqual(['guest']);
    });

    test.each([
        ['without room name', { roomName: '', playerName: 'player' }, HOST_CONNECTION, 'Payload not valid'],
        ['without player', { roomName: 'room', playerName: '' }, HOST_CONNECTION, 'Payload not valid'],
        ['of a room missing', { roomName: 'missing', playerName: 'player' }, HOST_CONNECTION, 'Room \'missing\' does not exist'],
        ['of another player than the host', { roomName: 'room', playerName: 'player' }, GUEST_CONNECTION, 'You are not the host of the room'],
        ['of the host', { roomName: 'room', playerName: 'host' }, HOST_CONNECTION, 'The host can not be banned'],
    ])('should refuse a request %s', async (_case: string, data: PlayerRequest, connection: string, message: string) => {
        // When / Then
        await expect(ban(data, connection)).rejects.toThrow(message);
        expect(await readBanned('room')).toEqual([]);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
