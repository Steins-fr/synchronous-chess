import { PeerRoomNetwork } from './peer-room-network';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { RtcSignal } from '@protocol/rtc-signal';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum, RoomSocketApiNotifications } from '@protocol/socket-packet-payload.type';
import { WebrtcMock } from '@testing/webrtc.mock';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class TestPeerRoomNetwork extends PeerRoomNetwork {
    public get host(): Player | undefined {
        return this.hostPlayer;
    }

    public override addPlayer(player: WebRtcPlayer): void {
        super.addPlayer(player);
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
}

const signal: RtcSignal = { sdp: { sdp: 'sdp', type: 'offer' }, ice: [] };

function newPlayerMessage(playerName: string): ReceivedMessage {
    return { type: HostRoomMessageType.NEW_PLAYER, payload: { playerName }, origin: MessageOriginType.HOST_ROOM, from: 'host' };
}

function remoteSignalMessage(from: string): ReceivedMessage {
    return { type: HostRoomMessageType.REMOTE_SIGNAL, payload: { from, signal }, origin: MessageOriginType.HOST_ROOM, from: 'host' };
}

describe('PeerRoomNetwork', () => {
    let roomSocketApi: RoomSocketApi;
    let network: TestPeerRoomNetwork;
    let hostPlayer: Player;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        vi.spyOn(Negotiator.prototype, 'initiate').mockResolvedValue(undefined);
        vi.spyOn(Negotiator.prototype, 'negotiationMessage').mockResolvedValue(undefined);
        roomSocketApi = TestHelper.cast<RoomSocketApi>({ notification$: new Subject<RoomSocketApiNotifications>(), close: vi.fn() });
        network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, 'token');
        hostPlayer = TestHelper.cast<Player>({ name: 'host', sendData: vi.fn() });
    });

    afterEach(() => {
        network.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should negotiate with the host through the socket', () => {
        expect(network.initiator).toEqual(false);
        expect(network.negotiators().get('host')).toBeInstanceOf(WebsocketNegotiator);
    });

    test('should only take the player named as host as host', () => {
        // Given
        const other = TestHelper.cast<Player>({ name: 'other' });

        // When
        network.onPlayerConnected(other);

        // Then
        expect(network.host).toBeUndefined();

        // When
        network.onPlayerDisconnected(hostPlayer);
        network.onPlayerConnected(hostPlayer);
        network.onPlayerConnected(other);
        network.onPlayerDisconnected(other);

        // Then
        expect(network.host).toBe(hostPlayer);

        // When
        network.onPlayerDisconnected(hostPlayer);

        // Then
        expect(network.host).toBeUndefined();
    });

    test('should ignore messages which do not come from the host room', () => {
        // When
        network.onRoomMessage({ type: NegotiatorMessageType.SIGNAL, payload: { to: 'a', signal }, origin: MessageOriginType.NEGOTIATOR, from: 'host' });

        // Then
        expect(roomSocketApi.close).not.toHaveBeenCalled();
    });

    test('should close the socket once notified of its own arrival', () => {
        // When
        network.onRoomMessage(newPlayerMessage('local'));

        // Then
        expect(roomSocketApi.close).toHaveBeenCalledTimes(1);
        expect(Negotiator.prototype.initiate).not.toHaveBeenCalled();
    });

    test('should negotiate with a new player through the host', async () => {
        // Given
        network.onPlayerConnected(hostPlayer);

        // When
        network.onRoomMessage(newPlayerMessage('host'));
        network.onRoomMessage(newPlayerMessage('newcomer'));
        await vi.waitFor(() => expect(network.negotiators().get('newcomer')).toBeInstanceOf(WebrtcNegotiator));

        // Then
        expect(Negotiator.prototype.initiate).toHaveBeenCalledTimes(1);
    });

    test('should ignore remote signals without host', async () => {
        // When
        network.onRoomMessage(remoteSignalMessage('newcomer'));
        await Promise.resolve();

        // Then
        expect(network.negotiators().has('newcomer')).toEqual(false);
        expect(Negotiator.prototype.negotiationMessage).not.toHaveBeenCalled();
    });

    test('should forward remote signals to a new or existing negotiator', async () => {
        // Given
        network.onPlayerConnected(hostPlayer);

        // When
        network.onRoomMessage(remoteSignalMessage('newcomer'));
        const negotiator: Readonly<Negotiator> | undefined = network.negotiators().get('newcomer');
        network.onRoomMessage(remoteSignalMessage('newcomer'));
        await vi.waitFor(() => expect(Negotiator.prototype.negotiationMessage).toHaveBeenCalledTimes(2));

        // Then
        expect(negotiator).toBeInstanceOf(WebrtcNegotiator);
        expect(network.negotiators().get('newcomer')).toBe(negotiator);
        expect(Negotiator.prototype.negotiationMessage).toHaveBeenCalledWith({ from: 'newcomer', signal });
    });

    test('should drop a remote signal it could not register, before any negotiator', async () => {
        // Given
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        network.onPlayerConnected(hostPlayer);
        const invalidSignal = TestHelper.cast<RtcSignal>({ sdp: { sdp: 'sdp', type: 'offer' }, ice: [{ candidate: 'c1' }] });

        // When
        network.onRoomMessage({ type: HostRoomMessageType.REMOTE_SIGNAL, payload: { from: 'newcomer', signal: invalidSignal }, origin: MessageOriginType.HOST_ROOM, from: 'host' });
        await Promise.resolve();

        // Then
        expect(network.negotiators().has('newcomer')).toEqual(false);
        expect(Negotiator.prototype.negotiationMessage).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith('PeerRoom: invalid remote signal', { from: 'newcomer', signal: invalidSignal });
    });

    describe('host change', () => {
        let notification$: Subject<RoomSocketApiNotifications>;

        function addRemotePlayer(name: string): WebrtcMock {
            const webrtcMock: WebrtcMock = new WebrtcMock();
            network.addPlayer(new WebRtcPlayer(name, webrtcMock.webrtc));
            return webrtcMock;
        }

        beforeEach(() => {
            network.clear();
            notification$ = new Subject<RoomSocketApiNotifications>();
            // The socket of the player closed once it joined
            roomSocketApi = TestHelper.cast<RoomSocketApi>({
                notification$,
                closed$: new Subject<void>(),
                close: vi.fn(),
                keepAlive: vi.fn(),
                reconnect: vi.fn().mockResolvedValue(undefined),
                send: vi.fn().mockResolvedValue({ players: ['host', 'local', 'alice'] }),
                socketOpenedAt: undefined,
            });
            network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, 'token');
        });

        test('should connect to the joining players through the new host', async () => {
            // Given
            addRemotePlayer('alice');

            // When
            network.changeHost('alice');
            network.onRoomMessage(newPlayerMessage('newcomer'));
            await vi.waitFor(() => expect(network.negotiators().get('newcomer')).toBeInstanceOf(WebrtcNegotiator));

            // Then
            expect(network.hostName).toEqual('alice');
            expect(network.host?.name).toEqual('alice');
            expect(network.initiator).toEqual(false);
            expect(roomSocketApi.reconnect).not.toHaveBeenCalled();
        });

        test('should take the room over when elected, and tell the API the players of the room', async () => {
            // Given
            addRemotePlayer('alice');

            // When
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(network.hostName).toEqual('local');
            expect(network.host).toBeUndefined();
            expect(network.initiator).toEqual(true);
            expect(roomSocketApi.keepAlive).toHaveBeenCalledTimes(1);
            expect(roomSocketApi.reconnect).toHaveBeenCalledWith({ roomName: 'room', playerName: 'local', token: 'token' });
            // The former host leaves the players of the room on the API
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'host' });
        });

        test('should host the room once it took it over', async () => {
            // Given
            const alice: WebrtcMock = addRemotePlayer('alice');
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);

            // When a player joins, connects, and the others connect to it through this participant
            notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'newcomer' } });
            await vi.waitFor(() => expect(network.negotiators().get('newcomer')).toBeInstanceOf(WebsocketNegotiator));
            network.onPlayerConnected(TestHelper.cast<Player>({ name: 'newcomer' }));
            network.onRoomMessage({ type: NegotiatorMessageType.SIGNAL, payload: { to: 'alice', signal }, origin: MessageOriginType.NEGOTIATOR, from: 'newcomer' });
            network.onPlayerDisconnected(TestHelper.cast<Player>({ name: 'newcomer' }));

            // Then
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'newcomer' });
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'newcomer' });
            expect(alice.sendMessage).toHaveBeenCalledWith({ type: HostRoomMessageType.NEW_PLAYER, payload: { playerName: 'newcomer' }, origin: MessageOriginType.HOST_ROOM });
            expect(alice.sendMessage).toHaveBeenCalledWith({ type: HostRoomMessageType.REMOTE_SIGNAL, payload: { from: 'newcomer', signal }, origin: MessageOriginType.HOST_ROOM });
        });

        test('should keep hosting the room it took over', async () => {
            // Given
            addRemotePlayer('alice');
            network.changeHost('local');

            // When
            network.changeHost('alice');
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(network.hostName).toEqual('local');
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should tell the room is lost when the API refuses the takeover', async () => {
            // Given
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.mocked(roomSocketApi.reconnect).mockRejectedValue(new RoomApiError('Room \'room\' does not exist'));
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);

            // When
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(roomLost).toHaveBeenCalledTimes(1);
        });
    });

    test('should throw on unknown host room message', () => {
        // When
        const call = (): void => network.onRoomMessage({ type: 'unknown' as HostRoomMessageType, payload: { playerName: 'a' }, origin: MessageOriginType.HOST_ROOM, from: 'host' } as ReceivedMessage);

        // Then
        expect(call).toThrow('Unhandled switch case');
    });
});
