import { PeerRoomNetwork } from './peer-room-network';
import { JoinFailure, RejoinResult } from './room-network';
import { Negotiator, NegotiatorConnectionState } from '../negotiator/negotiator';
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
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { WebrtcMock } from '@testing/webrtc.mock';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RoomGame } from '@protocol/room-game.enum';

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
        network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, { game: RoomGame.CHESS, token: 'token' });
        hostPlayer = TestHelper.cast<Player>({ name: 'host', sendData: vi.fn() });
    });

    afterEach(() => {
        network.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    /** The negotiation with the host succeeds: the host player replaces its negotiator */
    function connectToHost(): void {
        vi.spyOn(Webrtc.prototype, 'sendMessage').mockReturnValue(1);
        vi.spyOn(Webrtc.prototype, 'close').mockImplementation(() => undefined);
        TestHelper.cast<{ setConnectionState(state: NegotiatorConnectionState): void }>(network.negotiators().get('host'))
            .setConnectionState(NegotiatorConnectionState.CONNECTED);
    }

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

    test('should not remove a player from the room it does not host', () => {
        // Given
        roomSocketApi.send = vi.fn();

        // When
        network.removeFromRoom('alice');

        // Then
        expect(roomSocketApi.send).not.toHaveBeenCalled();
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

    describe('rejoin', () => {
        beforeEach(() => {
            network.clear();
            roomSocketApi = TestHelper.cast<RoomSocketApi>({
                notification$: new Subject<RoomSocketApiNotifications>(),
                closed$: new Subject<void>(),
                close: vi.fn(),
                keepAlive: vi.fn(),
                reconnect: vi.fn().mockResolvedValue(undefined),
                send: vi.fn(),
                socketOpenedAt: undefined,
            });
            network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, { game: RoomGame.CHESS, token: 'token' });
            // The negotiation with the host is over: it connected, then the participant lost every connection
            connectToHost();
        });

        test('should join the room again, and connect to the host the API names', async () => {
            // Given
            vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'alice' });

            // When
            const result: RejoinResult = await network.rejoin();

            // Then
            expect(result).toEqual(RejoinResult.JOINED);
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'local', game: RoomGame.CHESS, token: 'token' });
            expect(network.hostName).toEqual('alice');
            expect(network.negotiators().get('alice')).toBeInstanceOf(WebsocketNegotiator);
        });

        test('should join a private room again with its password', async () => {
            // Given
            network.clear();
            network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, { game: RoomGame.CHAT, password: 'secret', token: 'token' });
            connectToHost();
            vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'host' });

            // When
            const result: RejoinResult = await network.rejoin();

            // Then
            expect(result).toEqual(RejoinResult.JOINED);
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, {
                roomName: 'room', playerName: 'local', game: RoomGame.CHAT, password: 'secret', token: 'token',
            });
        });

        test('should tell the host is gone, the API refusing the join for 20 seconds', async () => {
            // Given
            vi.mocked(roomSocketApi.send).mockRejectedValue(new RoomApiError('Host disconnected'));

            // When
            const rejoining: Promise<RejoinResult> = network.rejoin();
            await vi.advanceTimersByTimeAsync(20_000);

            // Then
            expect(await rejoining).toEqual(RejoinResult.HOST_LEFT);
            expect(roomSocketApi.send).toHaveBeenCalledTimes(11);
        });

        test('should log a failure of the socket, to join again later', async () => {
            // Given
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const error: Error = new Error('Socket connection failed');
            vi.mocked(roomSocketApi.send).mockRejectedValue(error);
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);

            // When / Then
            expect(await network.rejoin()).toEqual(RejoinResult.NOT_JOINED);
            expect(console.error).toHaveBeenCalledWith('PeerRoom: the room could not be joined again', error);
            expect(roomLost).not.toHaveBeenCalled();
        });

        test('should join again later while the API keeps the former connection in the room', async () => {
            // Given
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.mocked(roomSocketApi.send).mockRejectedValue(new RoomApiError('Already in game'));

            // When
            const rejoining: Promise<RejoinResult> = network.rejoin();
            await vi.advanceTimersByTimeAsync(20_000);

            // Then
            expect(await rejoining).toEqual(RejoinResult.NOT_JOINED);
        });

        test('should wait for the end of a lock of the passwords caused by another client of its IP, to join again', async () => {
            // Given
            vi.mocked(roomSocketApi.send)
                .mockRejectedValueOnce(new RoomApiError('Too many password attempts'))
                .mockResolvedValue({ playerName: 'host' });

            // When
            const rejoining: Promise<RejoinResult> = network.rejoin();
            await vi.advanceTimersByTimeAsync(59_999);

            // Then
            expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(await rejoining).toEqual(RejoinResult.JOINED);
            expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        });

        test('should tell the room is lost when the API refuses the join for good', async () => {
            // Given
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.mocked(roomSocketApi.send).mockRejectedValue(new RoomApiError('Room \'room\' does not exist'));
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);

            // When / Then
            expect(await network.rejoin()).toEqual(RejoinResult.ROOM_LOST);
            expect(roomLost).toHaveBeenCalledTimes(1);
        });

        test('should let the room it hosts go, then join it again', async () => {
            // Given
            vi.mocked(roomSocketApi.send).mockResolvedValue({ players: [] });
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);
            vi.mocked(roomSocketApi.send).mockResolvedValue({ playerName: 'alice' });

            // When
            const result: RejoinResult = await network.rejoin();
            TestHelper.cast<{ closed$: Subject<void> }>(roomSocketApi).closed$.next();
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(result).toEqual(RejoinResult.JOINED);
            expect(roomSocketApi.close).toHaveBeenCalledTimes(1);
            expect(network.initiator).toEqual(false);
            expect(network.hostName).toEqual('alice');
            // No longer moving the room to a new socket
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should not join again while connecting to a participant', async () => {
            // Given
            network.addPlayer(new WebRtcPlayer('relay', new WebrtcMock().webrtc));
            network.restoreLink('alice', 'relay');

            // When / Then
            expect(await network.rejoin()).toEqual(RejoinResult.NOT_JOINED);
            expect(roomSocketApi.send).not.toHaveBeenCalled();
        });
    });

    describe('join failure', () => {
        let notification$: Subject<RoomSocketApiNotifications>;
        let joinFailed: JoinFailure[];

        beforeEach(() => {
            network.clear();
            notification$ = new Subject<RoomSocketApiNotifications>();
            roomSocketApi = TestHelper.cast<RoomSocketApi>({ notification$, close: vi.fn(), send: vi.fn().mockResolvedValue({ playerName: 'host' }) });
            network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, { game: RoomGame.CHESS, token: 'token' });
            joinFailed = [];
            network.joinFailed$.subscribe((failure: JoinFailure) => joinFailed.push(failure));
        });

        test('should give the room up when the host refuses the player, its room full', () => {
            // When
            notification$.next({ type: RoomSocketApiNotificationEnum.FULL, data: { roomName: 'room', from: 'host' } });

            // Then
            expect(joinFailed).toEqual([JoinFailure.ROOM_FULL]);
            expect(roomSocketApi.send).not.toHaveBeenCalled();
            expect(network.negotiators().size).toEqual(0);
        });

        test('should join the room again through a new socket once the negotiation with the host failed, then give it up', async () => {
            // Given
            const joiningAgain = vi.fn();
            network.joiningAgain$.subscribe(joiningAgain);

            // When
            await vi.advanceTimersByTimeAsync(15_000);

            // Then
            expect(joiningAgain).toHaveBeenCalledTimes(1);
            expect(roomSocketApi.close).toHaveBeenCalledTimes(1);
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.JOIN, { roomName: 'room', playerName: 'local', game: RoomGame.CHESS, token: 'token' });
            expect(network.negotiators().get('host')).toBeInstanceOf(WebsocketNegotiator);
            expect(joinFailed).toEqual([]);

            // When
            await vi.advanceTimersByTimeAsync(15_000);

            // Then
            expect(joinFailed).toEqual([JoinFailure.HOST_UNREACHABLE]);
            expect(joiningAgain).toHaveBeenCalledTimes(1);
            expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
            expect(network.negotiators().size).toEqual(0);
        });

        test('should join the room again after each failure following a connection to the host', async () => {
            // Given the second negotiation connects
            await vi.advanceTimersByTimeAsync(15_000);
            connectToHost();
            // Having lost the host, the participant joins the room again
            expect(await network.rejoin()).toEqual(RejoinResult.JOINED);

            // When
            await vi.advanceTimersByTimeAsync(15_000);

            // Then
            expect(joinFailed).toEqual([]);
            expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
        });

        test('should give the room up when it can not be joined again', async () => {
            // Given
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const error: RoomApiError = new RoomApiError('Room \'room\' does not exist');
            vi.mocked(roomSocketApi.send).mockRejectedValue(error);

            // When
            await vi.advanceTimersByTimeAsync(15_000);

            // Then
            expect(joinFailed).toEqual([JoinFailure.HOST_UNREACHABLE]);
            expect(console.error).toHaveBeenCalledWith('PeerRoom: the room could not be joined again', error);
        });

        test('should not join again while joining the room', async () => {
            // Given
            let join: (response: { playerName: string }) => void = () => undefined;
            vi.mocked(roomSocketApi.send).mockReturnValue(TestHelper.cast(new Promise((resolve) => join = resolve)));
            await vi.advanceTimersByTimeAsync(15_000);

            // When
            const result: RejoinResult = await network.rejoin();
            join({ playerName: 'host' });
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(result).toEqual(RejoinResult.NOT_JOINED);
            expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
            expect(network.negotiators().get('host')).toBeInstanceOf(WebsocketNegotiator);
        });
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
            network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host', 4, { game: RoomGame.CHESS, token: 'token' });
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
            network.removeFromRoom('host');
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

        test('should move the room at once to a new socket, even with the socket of its last join open', async () => {
            // Given
            Object.assign(roomSocketApi, { socketOpenedAt: Date.now() });

            // When
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should keep the socket of the room it hosts when told it joined', async () => {
            // Given
            network.changeHost('local');

            // When
            network.onRoomMessage(newPlayerMessage('local'));

            // Then
            expect(roomSocketApi.close).not.toHaveBeenCalled();
        });

        test('should host the room once it took it over', async () => {
            // Given
            const alice: WebrtcMock = addRemotePlayer('alice');
            network.changeHost('local');
            await vi.advanceTimersByTimeAsync(0);

            // When a player joins, connects, then leaves
            notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'newcomer' } });
            await vi.waitFor(() => expect(network.negotiators().get('newcomer')).toBeInstanceOf(WebsocketNegotiator));
            network.onPlayerConnected(TestHelper.cast<Player>({ name: 'newcomer' }));
            network.removeFromRoom('newcomer');

            // Then
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'newcomer' });
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'newcomer' });
            expect(alice.sendMessage).toHaveBeenCalledWith({ type: HostRoomMessageType.NEW_PLAYER, payload: { playerName: 'newcomer' }, origin: MessageOriginType.HOST_ROOM });
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
});
