import { RoomGame } from '@protocol/room-game.enum';
import RoomsRequest from '@protocol/requests/rooms-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import RoomRepository from '@repositories/room-repository';
import { anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { describe, expect, test, vi } from 'vitest';
import RoomGetAllHandler from './room-get-all-handler';

describe('RoomGetAllHandler', () => {
    const { apiGateway }: AwsMocks = mockAws();
    // A connection in no room
    const connection: string = 'visitor-connection';

    function getAll(data: RoomsRequest): Promise<void> {
        return new RoomGetAllHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.ROOM_GET_ALL, data)).execute();
    }

    test('should reply the most recent rooms of the game', async () => {
        // Given
        await storeRoom(aRoom({ id: 'other', nameKey: 'other', hostPlayer: 'other', createdAt: '2026-10-11T11:00:00.000Z' }));
        await storeRoom(aRoom());

        // When
        await getAll({ game: RoomGame.CHESS });

        // Then
        expect(postedPackets(apiGateway)).toEqual([{
            to: connection,
            packet: {
                id: 7,
                type: 'rooms',
                data: {
                    rooms: [
                        { roomName: 'room', hostPlayer: 'host', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true },
                        { roomName: 'other', hostPlayer: 'other', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true },
                    ],
                    hasMore: false,
                },
            },
        }]);
    });

    test('should reply the rooms matching the search', async () => {
        // Given a room whose name holds the search, whatever its case, and a room whose name does not
        await storeRoom(aRoom());
        await storeRoom(aRoom({ id: 'other', nameKey: 'other', hostPlayer: 'other' }));

        // When
        await getAll({ game: RoomGame.CHESS, search: 'OTH' });

        // Then
        expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: expect.objectContaining({ data: { rooms: [expect.objectContaining({ roomName: 'other' })], hasMore: false } }) }]);
    });

    test.each<[string, RoomsRequest]>([
        ['an unknown game', { game: 'go' as RoomGame }],
        ['a search not a text', { game: RoomGame.CHESS, search: 42 as unknown as string }],
        ['a too long search', { game: RoomGame.CHESS, search: 's'.repeat(65) }],
    ])('should refuse a request for %s', async (_case: string, data: RoomsRequest) => {
        // Given
        const findRecentRooms = vi.spyOn(RoomRepository.prototype, 'findRecentRooms');
        const findRoomsContaining = vi.spyOn(RoomRepository.prototype, 'findRoomsContaining');

        // When / Then
        await expect(getAll(data)).rejects.toThrow('Payload not valid');
        expect(findRecentRooms).not.toHaveBeenCalled();
        expect(findRoomsContaining).not.toHaveBeenCalled();
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid', connection)]);
    });
});
