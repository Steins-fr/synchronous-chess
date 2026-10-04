import { PeerRoomNetwork } from './peer-room-network';
import { Negotiator } from '../negotiator/negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import {
    RoomApiRequestTypeEnum,
    RoomSocketApiNotificationEnum,
    RoomSocketApiNotifications
} from '@protocol/socket-packet-payload.type';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/** The network of the player creating the room, which hosts it */
class TestHostRoomNetwork extends PeerRoomNetwork {
    public override onPlayerConnected(player: Player): void {
        super.onPlayerConnected(player);
    }

    public override onPlayerDisconnected(player: Player): void {
        super.onPlayerDisconnected(player);
    }

    public override addPlayer(player: WebRtcPlayer): void {
        super.addPlayer(player);
    }
}

describe('RoomHosting', () => {
    const replacementDelay: number = 100 * 60_000;
    let notification$: Subject<RoomSocketApiNotifications>;
    let closed$: Subject<void>;
    let roomSocketApi: RoomSocketApi;
    let network: TestHostRoomNetwork;

    function createNetwork(maxPlayer: number = 2): TestHostRoomNetwork {
        network = new TestHostRoomNetwork(roomSocketApi, 'room', 'host', 'host', maxPlayer, 'token');
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
        closed$ = new Subject<void>();
        roomSocketApi = TestHelper.cast<RoomSocketApi>({
            notification$,
            closed$,
            send: vi.fn().mockResolvedValue({ players: ['host'] }),
            // The socket replacing the current one opens now
            reconnect: vi.fn(async () => void Object.assign(roomSocketApi, { socketOpenedAt: Date.now() })),
            keepAlive: vi.fn(),
            socketOpenedAt: Date.now(),
        });
    });

    afterEach(() => {
        network.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should keep its socket alive', () => {
        // When
        createNetwork();

        // Then
        expect(roomSocketApi.keepAlive).toHaveBeenCalledTimes(1);
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

    describe('room socket', () => {
        test('should move the room to a new socket before API Gateway closes the current one, every 100 minutes', async () => {
            // Given
            createNetwork();

            // When
            await vi.advanceTimersByTimeAsync(replacementDelay - 1);
            const before: number = vi.mocked(roomSocketApi.reconnect).mock.calls.length;
            await vi.advanceTimersByTimeAsync(1 + replacementDelay);

            // Then
            expect(before).toEqual(0);
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(2);
            expect(roomSocketApi.reconnect).toHaveBeenCalledWith({ roomName: 'room', playerName: 'host', token: 'token' });
        });

        test('should replace the socket 100 minutes after it opened, before the room was built', async () => {
            // Given: the socket of a creation refused 60 minutes before
            Object.assign(roomSocketApi, { socketOpenedAt: Date.now() - 60 * 60_000 });
            createNetwork();

            // When
            await vi.advanceTimersByTimeAsync(40 * 60_000);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should reconnect the room at once without open socket', async () => {
            // Given
            Object.assign(roomSocketApi, { socketOpenedAt: undefined });

            // When
            createNetwork();
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should reconnect again when the new socket closes while the players are synchronized', async () => {
            // Given
            createNetwork();
            vi.mocked(roomSocketApi.send).mockReturnValue(new Promise(() => undefined));
            closed$.next();
            await vi.advanceTimersByTimeAsync(0);

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(2);
        });

        test('should synchronize the server players once reconnected, keeping the ones lost but not agreed left', async () => {
            // Given
            createNetwork();
            addRemotePlayer('remote');
            vi.mocked(roomSocketApi.send).mockImplementation(async (type: RoomApiRequestTypeEnum) => {
                return type === RoomApiRequestTypeEnum.PLAYER_GET_ALL ? { players: ['host', 'ghost', 'lost'] } : { playerName: '' };
            });
            closed$.next();
            network.removeFromRoom('ghost');
            vi.mocked(roomSocketApi.send).mockClear();

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(0);

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
            closed$.next();
            await vi.advanceTimersByTimeAsync(0);

            // Then
            expect(console.error).toHaveBeenCalledWith('sync failure');
        });

        test('should reconnect the room once its socket closed, and replace the new socket 100 minutes later', async () => {
            // Given
            createNetwork();
            await vi.advanceTimersByTimeAsync(replacementDelay / 2);

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(replacementDelay / 2);
            const atFirstReplacement: number = vi.mocked(roomSocketApi.reconnect).mock.calls.length;
            await vi.advanceTimersByTimeAsync(replacementDelay / 2);

            // Then
            expect(atFirstReplacement).toEqual(1);
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(2);
        });

        test('should not reconnect the room twice at a time', async () => {
            // Given
            createNetwork();
            vi.mocked(roomSocketApi.reconnect).mockReturnValue(new Promise<void>(() => undefined));

            // When
            closed$.next();
            closed$.next();
            await vi.advanceTimersByTimeAsync(replacementDelay);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
        });

        test('should retry a failed reconnection every 5 seconds', async () => {
            // Given
            createNetwork();
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);
            vi.mocked(roomSocketApi.reconnect)
                .mockRejectedValueOnce(new Error('Socket connection failed'))
                .mockRejectedValueOnce(new Error('Socket connection failed'));

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(10_000);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(3);
            expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName: 'room' });
            expect(roomLost).not.toHaveBeenCalled();
        });

        test('should retry while the API tells the former host is still connected, as for a takeover', async () => {
            // Given
            createNetwork();
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);
            vi.mocked(roomSocketApi.reconnect).mockRejectedValueOnce(new RoomApiError('Host connected'));

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(5000);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(2);
            expect(roomLost).not.toHaveBeenCalled();
        });

        test('should lose the room after 10 minutes of failed reconnections', async () => {
            // Given
            createNetwork();
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);
            vi.mocked(roomSocketApi.reconnect).mockRejectedValue(new Error('Socket connection failed'));

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(10 * 60_000);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(121);
            expect(roomLost).toHaveBeenCalledTimes(1);
            expect(console.error).toHaveBeenCalledWith('HostRoom: the room could not move to a new socket', expect.any(Error));
        });

        test('should lose the room at once when the API refuses the reconnection, and no longer reconnect it', async () => {
            // Given
            createNetwork();
            const roomLost = vi.fn();
            network.roomLost$.subscribe(roomLost);
            vi.mocked(roomSocketApi.reconnect).mockRejectedValue(new RoomApiError('Room \'room\' does not exist'));

            // When
            closed$.next();
            await vi.advanceTimersByTimeAsync(0);
            closed$.next();
            await vi.advanceTimersByTimeAsync(replacementDelay);

            // Then
            expect(roomSocketApi.reconnect).toHaveBeenCalledTimes(1);
            expect(roomLost).toHaveBeenCalledTimes(1);
        });
    });

    test('should declare the connected players to the server, and remove the ones the room agreed left only', async () => {
        // Given
        createNetwork();
        const player = TestHelper.cast<Player>({ name: 'remote' });

        // When
        network.onPlayerConnected(player);
        network.onPlayerDisconnected(player);
        network.removeFromRoom('remote');

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: 'room', playerName: 'remote' });
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'remote' });
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
    });

    test('should log a failed removal', async () => {
        // Given
        createNetwork();
        vi.mocked(roomSocketApi.send).mockRejectedValue('remove failure');

        // When
        network.removeFromRoom('remote');
        await vi.advanceTimersByTimeAsync(0);

        // Then
        expect(console.error).toHaveBeenCalledWith('remove failure');
    });

    test('should remove a player which left while the socket was closed once the room moved to a new socket', async () => {
        // Given
        createNetwork();
        let moved: () => void = () => undefined;
        vi.mocked(roomSocketApi.reconnect).mockReturnValue(new Promise<void>((resolve) => moved = resolve));
        vi.mocked(roomSocketApi.send).mockResolvedValue({ players: ['host', 'remote'] });
        closed$.next();

        // When
        network.removeFromRoom('remote');
        const whileClosed: number = vi.mocked(roomSocketApi.send).mock.calls.length;
        moved();
        await vi.advanceTimersByTimeAsync(0);

        // Then
        expect(whileClosed).toEqual(0);
        expect(roomSocketApi.send).toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: 'room', playerName: 'remote' });
    });

    test('should not remove a player which connected again', async () => {
        // Given
        createNetwork();
        vi.mocked(roomSocketApi.send).mockResolvedValue({ players: ['host', 'remote'] });
        closed$.next();
        network.removeFromRoom('remote');
        addRemotePlayer('remote');
        network.onPlayerConnected(TestHelper.cast<Player>({ name: 'remote' }));
        vi.mocked(roomSocketApi.send).mockClear();

        // When
        closed$.next();
        await vi.advanceTimersByTimeAsync(0);

        // Then
        expect(roomSocketApi.send).not.toHaveBeenCalledWith(RoomApiRequestTypeEnum.PLAYER_REMOVE, expect.anything());
    });

    test('should tell the remote players, the new one included, that a player connected', () => {
        // Given
        createNetwork();
        const remote: WebrtcMock = addRemotePlayer('remote');
        const newcomer: WebrtcMock = addRemotePlayer('newcomer');

        // When
        network.onPlayerConnected(TestHelper.cast<Player>({ name: 'newcomer' }));

        // Then
        const message = { type: HostRoomMessageType.NEW_PLAYER, payload: { playerName: 'newcomer' }, origin: MessageOriginType.HOST_ROOM };
        expect(remote.sendMessage).toHaveBeenCalledWith(message);
        expect(newcomer.sendMessage).toHaveBeenCalledWith(message);
    });

    test('clear should stop the notifications and the reconnections', async () => {
        // Given
        createNetwork();

        // When
        network.clear();
        notification$.next({ type: RoomSocketApiNotificationEnum.JOIN_REQUEST, data: { playerName: 'remote' } });
        await vi.advanceTimersByTimeAsync(replacementDelay);

        // Then
        expect(notification$.observed).toEqual(false);
        expect(closed$.observed).toEqual(false);
        expect(roomSocketApi.reconnect).not.toHaveBeenCalled();
        expect(roomSocketApi.send).not.toHaveBeenCalled();
    });
});
