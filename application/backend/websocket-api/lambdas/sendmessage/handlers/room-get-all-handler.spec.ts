import { ScanCommand } from '@aws-sdk/lib-dynamodb';
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

    test('should reply the open rooms of the game', async () => {
        // Given
        dynamo.on(ScanCommand).resolves({ Items: [aRoom()] });

        // When
        await getAll({ game: RoomGame.CHESS });

        // Then
        expect(postedPackets(apiGateway)).toEqual([{
            to: connection,
            packet: { id: 7, type: 'rooms', data: { rooms: [{ roomName: 'room', hostPlayer: 'host', playerCount: 1, maxPlayer: 2, isPrivate: false }] } },
        }]);
    });

    test('should refuse a request for an unknown game', async () => {
        // When / Then
        await expect(getAll({ game: 'go' as RoomGame })).rejects.toThrow('Payload not valid');
        expect(dynamo.commandCalls(ScanCommand)).toHaveLength(0);
        expect(postedPackets(apiGateway)).toEqual([errorReply('Payload not valid', connection)]);
    });
});
