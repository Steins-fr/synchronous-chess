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

    test('should reply the most recent rooms of the game', async () => {
        // Given
        dynamo.on(QueryCommand).resolves({ Items: [aRoom(), aRoom({ id: 'other', hostPlayer: 'other' })] });

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
        // Given the index by name finds the room named 'other', the index by host none
        dynamo.on(QueryCommand, { IndexName: 'game-name-index' }).resolves({ Items: [aRoom({ id: 'other', hostPlayer: 'other' })] });

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
        // When / Then
        await expect(getAll(data)).rejects.toThrow('Payload not valid');
        expect(dynamo.commandCalls(QueryCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid', connection)]);
    });
});
