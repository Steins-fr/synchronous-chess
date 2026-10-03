import FullRequest from '@protocol/requests/full-request';
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
import FullHandler from './full-handler';

describe('FullHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();

    function full(data: FullRequest, connection: string = HOST_CONNECTION): Promise<void> {
        return new FullHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.FULL, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom());
    });

    test('should tell a queued player that the room is full', async () => {
        // When
        await full({ roomName: 'room', to: 'guest' });

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: GUEST_CONNECTION, packet: { type: 'full', data: { from: 'host', roomName: 'room' } } },
            { to: HOST_CONNECTION, packet: { id: 7, type: 'fullSent', data: { from: 'host', roomName: 'room' } } },
        ]);
    });

    test.each([
        ['without room name', { roomName: '', to: 'guest' }, 'Payload not valid'],
        ['without player', { roomName: 'room', to: '' }, 'Payload not valid'],
        ['to an unknown player', { roomName: 'room', to: 'unknown' }, 'The player was not in the queue!'],
        ['to a player without connection', { roomName: 'room', to: 'host' }, 'The player was not in the queue!'],
    ])('should refuse a request %s', async (_case: string, data: FullRequest, message: string) => {
        // When / Then
        await expect(full(data)).rejects.toThrow(message);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message)]);
    });

    test('should only let the host tell it', async () => {
        // When / Then
        await expect(full({ roomName: 'room', to: 'guest' }, GUEST_CONNECTION)).rejects.toThrow('You are not the host of the room');
        expect(postedPackets(apiGateway)).toEqual([errorReply('You are not the host of the room', GUEST_CONNECTION)]);
    });
});
