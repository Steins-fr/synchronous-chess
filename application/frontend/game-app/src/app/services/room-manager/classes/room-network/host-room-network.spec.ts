import { HostRoomNetwork } from './host-room-network';
import { Negotiator } from '../negotiator/negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { RtcSignal } from '@protocol/rtc-signal';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomSocketApiNotifications
} from '@protocol/socket-packet-payload.type';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class TestHostRoomNetwork extends HostRoomNetwork {
    public override transmitNewPlayer(playerName: string): void {
        super.transmitNewPlayer(playerName);
    }

    public override onPlayerConnected(player: Player): void {
        super.onPlayerConnected(player);
    }

    public override onPlayerDisconnected(player: Player): void {
        super.onPlayerDisconnected(player);
    }

    public override onRoomMessage(message: ReceivedMessage): void {
        super.onRoomMessage(message);
    }

    public override addPlayer(player: WebRtcPlayer): void {
        super.addPlayer(player);
    }
}

const signal: RtcSignal = { sdp: { sdp: 'sdp', type: 'offer' }, ice: [] };

describe('HostRoomNetwork', () => {
    let notification$: Subject<RoomSocketApiNotifications>;
    let roomSocketApi: RoomSocketApi;
    let network: TestHostRoomNetwork;

    function createNetwork(maxPlayer: number = 2): TestHostRoomNetwork {
        network = new TestHostRoomNetwork(roomSocketApi, 'room', maxPlayer, 'host');
        return network;
    }

    function addRemotePlayer(name: string): WebrtcMock {
        const webrtcMock: WebrtcMock = new WebrtcMock();
        network.addPlayer(new WebRtcPlayer(name, webrtcMock.webrtc));
        return webrtcMock;
    }

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(Negotiator.prototype, 'initiate').mockResolvedValue(undefined);
        notification$ = new Subject<RoomSocketApiNotifications>();
        roomSocketApi = TestHelper.cast<RoomSocketApi>({ notification$, send: vi.fn().mockResolvedValue({}) });
    });

    afterEach(() => {
        network.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should be the initiator and the host', () => {
        // When
        const hostNetwork: TestHostRoomNetwork = createNetwork();

        // Then
        expect(hostNetwork.initiator).toEqual(true);
        expect(hostNetwork.hostName).toEqual('host');
    });

    test('should negotiate with a joining player', async () => {
        // Given
        createNetwork();
        const queueAdded: string[] = [];
        network.queueAdded$.subscribe((playerName: string) => queueAdded.push(playerName));

        // When
        notification$.next({ type: RoomSocketApiNotificationEnum.FULL, data: { roomName: 'room', from: 'remote' } });
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'remote' } });
        await vi.waitFor(() => expect(queueAdded).toEqual(['remote']));

        // Then
        expect(network.negotiators().get('remote')).toBeInstanceOf(WebsocketNegotiator);
        expect(Negotiator.prototype.initiate).toHaveBeenCalledTimes(1);
    });

    test('should refuse a joining player when the room is full', async () => {
        // Given
        createNetwork(1);
        vi.mocked(roomSocketApi.send).mockRejectedValueOnce('full failure');

        // When
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'remote' } });
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'other' } });
        await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('full failure'));

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.FULL, { to: 'remote', roomName: 'room' });
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.FULL, { to: 'other', roomName: 'room' });
        expect(network.negotiators().size).toEqual(0);
    });

    test('should synchronize the server players periodically', async () => {
        // Given
        createNetwork();
        addRemotePlayer('remote');
        vi.mocked(roomSocketApi.send).mockImplementation(async (type: RoomApiRequestTypeEnum) => {
            return type === RoomApiRequestTypeEnum.PLAYER_GET_ALL ? { players: ['host', 'ghost'] } : { playerName: '' };
        });

        // When
        await vi.advanceTimersByTimeAsync(360000);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName: 'room' });
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'remote' });
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'ghost' });
        expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
    });

    test('should log the synchronization errors', async () => {
        // Given
        createNetwork();
        vi.mocked(roomSocketApi.send).mockRejectedValue('sync failure');

        // When
        await vi.advanceTimersByTimeAsync(360000);

        // Then
        expect(console.error).toHaveBeenCalledWith('sync failure');
    });

    test('should declare the connected and disconnected players to the server', () => {
        // Given
        createNetwork();
        const player = TestHelper.cast<Player>({ name: 'remote' });

        // When
        network.onPlayerConnected(player);
        network.onPlayerDisconnected(player);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'remote' });
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'remote' });
    });

    test('transmitNewPlayer should notify the remote players', () => {
        // Given
        createNetwork();
        const webrtcMock: WebrtcMock = addRemotePlayer('remote');

        // When
        network.transmitNewPlayer('newcomer');

        // Then
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith({
            type: HostRoomMessageType.NEW_PLAYER,
            payload: { playerName: 'newcomer' },
            origin: MessageOriginType.HOST_ROOM,
        });
    });

    test('should relay the negotiation signals to the targeted player', () => {
        // Given
        createNetwork();
        const webrtcMock: WebrtcMock = addRemotePlayer('target');

        // When
        network.onRoomMessage({ type: HostRoomMessageType.NEW_PLAYER, payload: { playerName: 'x' }, origin: MessageOriginType.HOST_ROOM, from: 'a' });
        network.onRoomMessage({ type: 'other' as NegotiatorMessageType, payload: { to: 'target', signal }, origin: MessageOriginType.NEGOTIATOR, from: 'a' });
        network.onRoomMessage({ type: NegotiatorMessageType.SIGNAL, payload: { to: 'unknown', signal }, origin: MessageOriginType.NEGOTIATOR, from: 'a' });
        network.onRoomMessage({ type: NegotiatorMessageType.SIGNAL, payload: { to: 'target', signal }, origin: MessageOriginType.NEGOTIATOR, from: 'a' });

        // Then
        expect(console.warn).toHaveBeenCalledWith('HostRoom: no message', expect.anything());
        expect(webrtcMock.sendMessage).toHaveBeenCalledTimes(1);
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith({
            type: HostRoomMessageType.REMOTE_SIGNAL,
            payload: { from: 'a', signal },
            origin: MessageOriginType.HOST_ROOM,
        });
    });

    test('should not relay a signal the targeted player could not register', () => {
        // Given
        createNetwork();
        const webrtcMock: WebrtcMock = addRemotePlayer('target');
        const invalidSignal = TestHelper.cast<RtcSignal>({ sdp: { sdp: 'sdp', type: 'offer' }, ice: [null] });

        // When
        network.onRoomMessage({ type: NegotiatorMessageType.SIGNAL, payload: { to: 'target', signal: invalidSignal }, origin: MessageOriginType.NEGOTIATOR, from: 'a' });

        // Then
        expect(webrtcMock.sendMessage).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith('HostRoom: invalid signal not relayed', expect.anything());
    });

    test('clear should stop the notifications and the synchronization', async () => {
        // Given
        createNetwork();

        // When
        network.clear();
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'remote' } });
        await vi.advanceTimersByTimeAsync(360000);

        // Then
        expect(notification$.observed).toEqual(false);
        expect(roomSocketApi.send).not.toHaveBeenCalled();
    });
});
