import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { RoomGame } from '@protocol/room-game.enum';
import RoomsRequest from '@protocol/requests/rooms-request';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { anApiGatewayClient, aRequest, aRoom, AwsMocks, errorReply, mockAws, postedPackets } from '@testing/api-mocks';
import { describe, expect, test } from 'vitest';
import RoomGetAllHandler from './room-get-all-handler';

describe('RoomGetAllHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    // A connection in no room
    const connection: string = 'visitor-connection';

    function getAll(data: RoomsRequest): Promise<void> {
        return new RoomGetAllHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.ROOM_GET_ALL, data)).execute();
    }

    test.each<[string, RoomsRequest, string]>([
        ['every room', { game: RoomGame.CHESS }, 'room'],
        ['the rooms searched', { game: RoomGame.CHESS, search: 'ROO' }, 'room'],
    ])('should reply %s of the game', async (_case: string, data: RoomsRequest, roomName: string) => {
        // Given
        dynamo.on(QueryCommand).resolves({ Items: [aRoom(), aRoom({ id: 'other', hostPlayer: 'other' })] });

        // When
        await getAll(data);

        // Then
        const rooms: unknown[] = [{ roomName, hostPlayer: 'host', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true }];
        if (data.search === undefined) {
            rooms.unshift({ roomName: 'other', hostPlayer: 'other', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true });
        }
        expect(postedPackets(apiGateway)).toEqual([{ to: connection, packet: { id: 7, type: 'rooms', data: { rooms, hasMore: false } } }]);
    });

    test.each<[string, RoomsRequest]>([
        ['an unknown game', { game: 'go' as RoomGame }],
        ['a search not a text', { game: RoomGame.CHESS, search: 42 as unknown as string }],
        ['a too long search', { game: RoomGame.CHESS, search: 's'.repeat(65) }],
    ])('should refuse a request for %s', async (_case: string, data: RoomsRequest) => {
        // When / Then
        await expect(getAll(data)).rejects.toThrow('Payload not valid');
        expect(dynamo.commandCalls(QueryCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid', connection)]);
    });
});
