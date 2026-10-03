import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { aRequest, aRoom, AwsMocks, anEvent, GUEST_CONNECTION, mockAws, postedPackets, storeRoom } from '@testing/api-mocks';
import { describe, expect, test, vi } from 'vitest';
import { handler } from './app';
import CreateHandler from './handlers/create-handler';
import FullHandler from './handlers/full-handler';
import JoinHandler from './handlers/join-handler';
import MessageHandler from './handlers/message-handler';
import PlayerAddHandler from './handlers/player-add-handler';
import PlayerGetAllHandler from './handlers/player-get-all-handler';
import PlayerRemoveHandler from './handlers/player-remove-handler';
import SignalHandler from './handlers/signal-handler';

describe('sendmessage lambda', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();

    function body(type: string, data: object = { roomName: 'room' }): string {
        return JSON.stringify({ action: 'sendmessage', data: { id: 7, type, data } });
    }

    test('should handle a request and reply to it', async () => {
        // Given
        storeRoom(dynamo, aRoom());

        // When
        const response = await handler(anEvent(GUEST_CONNECTION, body(RoomApiRequestTypeEnum.PLAYER_GET_ALL)));

        // Then
        expect(response).toEqual({ statusCode: 200, body: 'Data sent.' });
        expect(postedPackets(apiGateway)).toEqual([{ to: GUEST_CONNECTION, packet: { id: 7, type: 'players', data: { players: ['host'] } } }]);
    });

    test.each([
        [RoomApiRequestTypeEnum.CREATE, CreateHandler],
        [RoomApiRequestTypeEnum.JOIN, JoinHandler],
        [RoomApiRequestTypeEnum.FULL, FullHandler],
        [RoomApiRequestTypeEnum.SIGNAL, SignalHandler],
        [RoomApiRequestTypeEnum.PLAYER_GET_ALL, PlayerGetAllHandler],
        [RoomApiRequestTypeEnum.PLAYER_ADD, PlayerAddHandler],
        [RoomApiRequestTypeEnum.PLAYER_REMOVE, PlayerRemoveHandler],
    ])('should hand a %s request to its handler', async (type: RoomApiRequestTypeEnum, messageHandler: typeof MessageHandler) => {
        // Given
        const execute = vi.spyOn(messageHandler.prototype, 'execute').mockResolvedValue();

        // When
        await handler(anEvent(GUEST_CONNECTION, JSON.stringify({ data: aRequest(type, { roomName: 'room' }) })));

        // Then
        expect(execute).toHaveBeenCalledTimes(1);
    });

    test('should refuse a request without connection', async () => {
        expect(await handler(anEvent(undefined, body(RoomApiRequestTypeEnum.PLAYER_GET_ALL)))).toEqual({ statusCode: 401, body: 'Unauthorized request.' });
    });

    test('should refuse an unknown request', async () => {
        expect(await handler(anEvent(GUEST_CONNECTION, body('unknown')))).toEqual({ statusCode: 401, body: 'Operation not permitted.' });
    });

    test.each([
        ['a request the handler refuses', body(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName: '' })],
        ['a body that is not JSON', 'not JSON'],
    ])('should answer a server error to %s', async (_case: string, eventBody: string) => {
        // When
        const response = await handler(anEvent(GUEST_CONNECTION, eventBody));

        // Then
        expect(response).toEqual({ statusCode: 500, body: 'Server error.' });
        expect(console.error).toHaveBeenCalled();
    });
});
