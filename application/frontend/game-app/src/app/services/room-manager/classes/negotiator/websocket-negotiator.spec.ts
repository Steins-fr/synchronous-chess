import { WebsocketNegotiator } from './websocket-negotiator';
import { NegotiatorConnectionState } from './negotiator';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApi,
    RoomSocketApiNotificationEnum,
    RoomSocketApiNotifications
} from '@app/services/room-api/room-socket.api';
import { RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const signal: RtcSignal = { sdp: { sdp: 'sdp', type: 'offer' }, ice: [] };

function createNegotiator(): {
    negotiator: WebsocketNegotiator;
    webrtcMock: WebrtcMock;
    notification$: Subject<RoomSocketApiNotifications>;
    roomSocketApi: RoomSocketApi;
    states: NegotiatorConnectionState[];
} {
    const notification$ = new Subject<RoomSocketApiNotifications>();
    const roomSocketApi = TestHelper.cast<RoomSocketApi>({ notification$, send: vi.fn().mockResolvedValue({}) });
    const webrtcMock: WebrtcMock = new WebrtcMock();
    const negotiator: WebsocketNegotiator = new WebsocketNegotiator('room', 'remote', webrtcMock.webrtc, roomSocketApi);
    const states: NegotiatorConnectionState[] = [];
    negotiator.connectionState$.subscribe((state: NegotiatorConnectionState) => states.push(state));
    return { negotiator, webrtcMock, notification$, roomSocketApi, states };
}

describe('WebsocketNegotiator', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should disconnect when the remote room is full', () => {
        // Given
        const { negotiator, notification$, states } = createNegotiator();

        // When
        notification$.next({ type: RoomSocketApiNotificationEnum.FULL, data: { roomName: 'room', from: 'other' } });
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'remote' } });
        notification$.next({ type: RoomSocketApiNotificationEnum.FULL, data: { roomName: 'room', from: 'remote' } });
        negotiator.clear();

        // Then
        expect(states).toEqual([NegotiatorConnectionState.DISCONNECTED]);
    });

    test('should register the remote signals', async () => {
        // Given
        const { negotiator, webrtcMock, notification$ } = createNegotiator();

        // When
        notification$.next({ type: RoomSocketApiNotificationEnum.REMOTE_SIGNAL, data: { from: 'remote', signal } });
        await vi.waitFor(() => expect(console.debug).toHaveBeenCalledWith('Negotiation message sent'));
        negotiator.clear();

        // Then
        expect(webrtcMock.registerSignal).toHaveBeenCalledWith(signal);
    });

    test('should send the local signals through the socket', async () => {
        // Given
        const { negotiator, webrtcMock, roomSocketApi } = createNegotiator();
        vi.mocked(roomSocketApi.send).mockRejectedValueOnce('send failure');
        await negotiator.initiate();

        // When
        webrtcMock.rtcSignal$.next(signal);
        webrtcMock.rtcSignal$.next(signal);
        await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('send failure'));
        negotiator.clear();

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.SIGNAL, { signal, to: 'remote', roomName: 'room' });
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
    });

    test('clear should stop listening to the socket notifications', () => {
        // Given
        const { negotiator, notification$, states } = createNegotiator();

        // When
        negotiator.clear();
        notification$.next({ type: RoomSocketApiNotificationEnum.FULL, data: { roomName: 'room', from: 'remote' } });

        // Then
        expect(states).toEqual([]);
        expect(notification$.observed).toEqual(false);
    });
});
