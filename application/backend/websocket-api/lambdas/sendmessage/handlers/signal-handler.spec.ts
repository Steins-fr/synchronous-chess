import RtcSignalRequest from '@protocol/requests/rtc-signal-request';
import { RtcSignal } from '@protocol/rtc-signal';
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
import SignalHandler from './signal-handler';

describe('SignalHandler', () => {
    const { dynamo, apiGateway }: AwsMocks = mockAws();
    const signal: RtcSignal = { sdp: { type: 'offer', sdp: 'v=0' }, ice: [{ candidate: 'candidate', sdpMid: '0' }] };

    function relay(data: RtcSignalRequest, connection: string): Promise<void> {
        return new SignalHandler(anApiGatewayClient(), connection, aRequest(RoomApiRequestTypeEnum.SIGNAL, data)).execute();
    }

    beforeEach(() => {
        storeRoom(dynamo, aRoom());
    });

    test('should relay the signal of a queued player to the host', async () => {
        // When
        await relay({ roomName: 'room', to: 'host', signal }, GUEST_CONNECTION);

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: HOST_CONNECTION, packet: { type: 'remoteSignal', data: { from: 'guest', signal } } },
            { to: GUEST_CONNECTION, packet: { id: 7, type: 'signalSent', data: { from: 'guest' } } },
        ]);
    });

    test('should relay the signal of the host to a queued player', async () => {
        // When
        await relay({ roomName: 'room', to: 'guest', signal }, HOST_CONNECTION);

        // Then
        expect(postedPackets(apiGateway)).toEqual([
            { to: GUEST_CONNECTION, packet: { type: 'remoteSignal', data: { from: 'host', signal } } },
            { to: HOST_CONNECTION, packet: { id: 7, type: 'signalSent', data: { from: 'host' } } },
        ]);
    });

    test.each([
        ['without room name', { roomName: '', to: 'host', signal }, GUEST_CONNECTION, 'Payload not valid'],
        ['without player', { roomName: 'room', to: '', signal }, GUEST_CONNECTION, 'Payload not valid'],
        ['with an invalid signal', { roomName: 'room', to: 'host', signal: { sdp: { type: 'unknown' }, ice: [] } as unknown as RtcSignal }, GUEST_CONNECTION, 'Payload not valid'],
        ['from a connection out of the room', { roomName: 'room', to: 'host', signal }, 'unknown-connection', 'You were not in the queue!'],
        ['from the host to an unknown player', { roomName: 'room', to: 'unknown', signal }, HOST_CONNECTION, 'The player was not in the queue!'],
        ['from the host to a player without connection', { roomName: 'room', to: 'host', signal }, HOST_CONNECTION, 'The player was not in the queue!'],
    ])('should refuse a signal %s', async (_case: string, data: RtcSignalRequest, connection: string, message: string) => {
        // When / Then
        await expect(relay(data, connection)).rejects.toThrow(message);
        expect(postedPackets(apiGateway)).toEqual([errorReply(message, connection)]);
    });
});
