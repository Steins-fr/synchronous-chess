import { epochSeconds } from '@helpers/time.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import RoomReconnectRequest from '@protocol/requests/room-reconnect-request';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import {
    anApiGatewayClient,
    aRequest,
    aRoom,
    AwsMocks,
    errorReply,
    HOST_TOKEN,
    mockAws,
    postedPackets,
    readConnections,
    readRoom,
    storeRoom,
} from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import ReconnectHandler from './reconnect-handler';

describe('ReconnectHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    const connection: string = 'new-host-connection';

    function reconnect(data: RoomReconnectRequest): Promise<void> {
        return new ReconnectHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.RECONNECT, data)).execute();
    }

    test.each([
        ['before its former connection closes', () => ({})],
        ['once its former connection closed, the room waiting for it', () => ({ expiresAt: epochSeconds() + 60 })],
    ])('should move the room to the new connection of its host %s', async (_case: string, waiting: () => Partial<Room>) => {
        // Given
        await storeRoom(aRoom(waiting()));

        // When
        await reconnect({ roomName: 'room', playerName: 'host', token: HOST_TOKEN });

        // Then: no longer waiting for its host
        expect(await readConnections()).toEqual([{ connectionId: connection, roomName: 'room' }]);
        expect(await readRoom('room')).toStrictEqual(aRoom({ connectionId: connection }));
        expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'reconnected', data: { roomName: 'room' } } }]);
    });

    test('should refuse another token than the host\'s', async () => {
        // Given
        await storeRoom(aRoom());

        // When / Then
        await expect(reconnect({ roomName: 'room', playerName: 'host', token: 'other-token' })).rejects.toThrow('You are not the host of the room');
        expect(await readRoom('room')).toStrictEqual(aRoom());
        expect(postedPackets(apiGateway)).toEqual([errorReply('You are not the host of the room', connection)]);
    });

    describe('a player taking over', () => {
        const players = [{ playerName: 'host' }, { playerName: 'player' }];

        test('should move the room waiting for its host to the connection of a player of the room, its new host', async () => {
            // Given
            const room: Room = aRoom({ players, tokenHashes: { ...aRoom().tokenHashes, player: hashToken('player-token') } });
            await storeRoom({ ...room, expiresAt: epochSeconds() + 60 });

            // When
            await reconnect({ roomName: 'room', playerName: 'player', token: 'player-token' });

            // Then
            expect(await readConnections()).toEqual([{ connectionId: connection, roomName: 'room' }]);
            expect(await readRoom('room')).toStrictEqual({ ...room, connectionId: connection, hostPlayer: 'player' });
            expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'reconnected', data: { roomName: 'room' } } }]);
        });

        test.each([
            ['while the host is connected', aRoom({ players }), 'player', RoomApiErrorMessage.HOST_CONNECTED],
            ['out of the room, even queued', aRoom({ players, expiresAt: epochSeconds() + 60 }), 'guest', 'You are not the host of the room'],
        ])('should refuse a player %s', async (_case: string, room: Room, playerName: string, message: string) => {
            // Given
            await storeRoom(room);

            // When / Then
            await expect(reconnect({ roomName: 'room', playerName, token: 'player-token' })).rejects.toThrow(message);
            expect(await readConnections()).toEqual([]);
            expect(await readRoom('room')).toStrictEqual(room);
            expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
        });
    });

    test.each([
        ['room name', { roomName: '', playerName: 'host', token: HOST_TOKEN }, 'Payload not valid'],
        ['player name', { roomName: 'room', playerName: '', token: HOST_TOKEN }, 'Payload not valid'],
        ['token', { roomName: 'room', playerName: 'host', token: '' }, 'Payload not valid'],
        ['room missing', { roomName: 'missing', playerName: 'host', token: HOST_TOKEN }, 'Room \'missing\' does not exist'],
    ])('should refuse a request with its %s', async (_case: string, data: RoomReconnectRequest, message: string) => {
        // Given
        await storeRoom(aRoom());

        // When / Then
        await expect(reconnect(data)).rejects.toThrow(message);
        expect(await readConnections()).toEqual([]);
        expect(await readRoom('room')).toStrictEqual(aRoom());
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
