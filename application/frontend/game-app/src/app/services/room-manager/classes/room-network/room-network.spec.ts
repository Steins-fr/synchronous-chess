import { RoomNetwork } from './room-network';
import { Negotiator, NegotiatorConnectionState } from '../negotiator/negotiator';
import { Player } from '../player/player';
import { WebRtcPlayer } from '../player/web-rtc-player';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { config, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class TestRoomNetwork extends RoomNetwork {
    public readonly initiator: boolean = false;
    public readonly hostName: string = 'host';
    public readonly onRoomMessageSpy = vi.fn();
    public readonly onPlayerConnectedSpy = vi.fn();
    public readonly onPlayerDisconnectedSpy = vi.fn();

    public constructor() {
        super(TestHelper.cast<RoomSocketApi>({}), 'room', 'local');
    }

    public override transmitMessage(message: NetworkMessage): void {
        super.transmitMessage(message);
    }

    public override isPlayerNameAlreadyInRoom(playerName: string): boolean {
        return super.isPlayerNameAlreadyInRoom(playerName);
    }

    public override addNegotiator(negotiator: Negotiator): void {
        super.addNegotiator(negotiator);
    }

    public override getNegotiator(playerName: string): Readonly<Negotiator> | undefined {
        return super.getNegotiator(playerName);
    }

    public override addPlayer(player: WebRtcPlayer): void {
        super.addPlayer(player);
    }

    public override getNegotiatorSize(): number {
        return super.getNegotiatorSize();
    }

    protected onRoomMessage(message: ReceivedMessage): void {
        this.onRoomMessageSpy(message);
    }

    protected onPlayerConnected(player: Player): void {
        this.onPlayerConnectedSpy(player);
    }

    protected onPlayerDisconnected(player: Player): void {
        this.onPlayerDisconnectedSpy(player);
    }
}

interface NegotiatorMock {
    negotiator: Negotiator;
    connectionState$: Subject<NegotiatorConnectionState>;
}

function createNegotiator(playerName: string): NegotiatorMock {
    const connectionState$ = new Subject<NegotiatorConnectionState>();
    const negotiator = TestHelper.cast<Negotiator>({
        playerName,
        webRTC: new WebrtcMock().webrtc,
        connectionState$,
        clear: vi.fn(),
    });
    return { negotiator, connectionState$ };
}

function createPlayer(name: string): { player: WebRtcPlayer; webrtcMock: WebrtcMock } {
    const webrtcMock: WebrtcMock = new WebrtcMock();
    return { player: new WebRtcPlayer(name, webrtcMock.webrtc), webrtcMock };
}

const message: NetworkMessage = {
    type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
    payload: null,
    origin: MessageOriginType.BLOCK_ROOM_SERVICE,
    chain: BlockChainName.CHESS,
};

describe('RoomNetwork', () => {
    let network: TestRoomNetwork;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        network = new TestRoomNetwork();
    });

    afterEach(() => {
        network.clear();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should contain the local player', () => {
        expect(network.localPlayer.name).toEqual('local');
        expect(network.roomName).toEqual('room');
        expect(network.isPlayerNameAlreadyInRoom('local')).toEqual(true);
        expect(network.isPlayerNameAlreadyInRoom('remote')).toEqual(false);
    });

    test('should register negotiators and replace the previous one', () => {
        // Given
        const queueAdded: string[] = [];
        network.queueAdded$.subscribe((playerName: string) => queueAdded.push(playerName));
        const first: NegotiatorMock = createNegotiator('remote');
        const second: NegotiatorMock = createNegotiator('remote');

        // When
        network.addNegotiator(first.negotiator);
        network.addNegotiator(second.negotiator);

        // Then
        expect(queueAdded).toEqual(['remote', 'remote']);
        expect(first.negotiator.clear).toHaveBeenCalledTimes(1);
        expect(network.getNegotiator('remote')).toBe(second.negotiator);
        expect(network.negotiators().get('remote')).toBe(second.negotiator);
        expect(network.getNegotiatorSize()).toEqual(1);
        expect(network.isPlayerNameAlreadyInRoom('remote')).toEqual(true);
    });

    test('should turn a connected negotiator into a player', () => {
        // Given
        const { negotiator, connectionState$ } = createNegotiator('remote');
        const addedPlayers: Player[] = [];
        const queueRemoved: string[] = [];
        network.playerAdded$.subscribe((player: Player) => addedPlayers.push(player));
        network.queueRemoved$.subscribe((playerName: string) => queueRemoved.push(playerName));
        network.addNegotiator(negotiator);

        // When
        connectionState$.next(NegotiatorConnectionState.CONNECTED);

        // Then
        expect(addedPlayers).toHaveLength(1);
        expect(addedPlayers[0]).toBeInstanceOf(WebRtcPlayer);
        expect(addedPlayers[0].name).toEqual('remote');
        expect(queueRemoved).toEqual(['remote']);
        expect(negotiator.clear).toHaveBeenCalledTimes(1);
        expect(network.getNegotiator('remote')).toBeUndefined();
        expect(network.onPlayerConnectedSpy).toHaveBeenCalledWith(addedPlayers[0]);
    });

    test('should remove a disconnected negotiator', () => {
        // Given
        const { negotiator, connectionState$ } = createNegotiator('remote');
        const queueRemoved: string[] = [];
        network.queueRemoved$.subscribe((playerName: string) => queueRemoved.push(playerName));
        network.addNegotiator(negotiator);

        // When
        connectionState$.next(NegotiatorConnectionState.DISCONNECTED);

        // Then
        expect(queueRemoved).toEqual(['remote']);
        expect(network.getNegotiatorSize()).toEqual(0);
    });

    test('should ignore the events of a replaced negotiator', () => {
        // Given
        const first: NegotiatorMock = createNegotiator('remote');
        const second: NegotiatorMock = createNegotiator('remote');
        const addedPlayers: Player[] = [];
        network.playerAdded$.subscribe((player: Player) => addedPlayers.push(player));
        network.addNegotiator(first.negotiator);
        network.addNegotiator(second.negotiator);

        // When
        first.connectionState$.next(NegotiatorConnectionState.CONNECTED);
        first.connectionState$.next(NegotiatorConnectionState.DISCONNECTED);

        // Then
        expect(addedPlayers).toEqual([]);
        expect(network.getNegotiator('remote')).toBe(second.negotiator);
    });

    test('should report unknown negotiator states', () => {
        // Given
        const onUnhandledError = config.onUnhandledError;
        const errorSpy = vi.fn();
        config.onUnhandledError = errorSpy;
        const { negotiator, connectionState$ } = createNegotiator('remote');
        network.addNegotiator(negotiator);

        // When
        connectionState$.next('unknown' as NegotiatorConnectionState);
        vi.runAllTimers();
        config.onUnhandledError = onUnhandledError;

        // Then
        expect(errorSpy).toHaveBeenCalledWith(new Error('Unhandled switch case: unknown'));
    });

    test('should forward the messages of the players', () => {
        // Given
        const { player, webrtcMock } = createPlayer('remote');
        const messages: ReceivedMessage[] = [];
        network.onMessage$.subscribe((received: ReceivedMessage) => messages.push(received));
        network.addPlayer(player);

        // When
        webrtcMock.data.next(message);

        // Then
        expect(network.onRoomMessageSpy).toHaveBeenCalledWith({ ...message, from: 'remote' });
        expect(messages).toEqual([{ ...message, from: 'remote' }]);
    });

    test('transmitMessage should send the message to the remote players', () => {
        // Given
        const { player, webrtcMock } = createPlayer('remote');
        network.addPlayer(player);

        // When
        network.transmitMessage(message);

        // Then
        expect(webrtcMock.sendMessage).toHaveBeenCalledWith(message);
    });

    test('should remove a disconnected player', () => {
        // Given
        const { player, webrtcMock } = createPlayer('remote');
        const removedPlayers: Player[] = [];
        network.playerRemoved$.subscribe((removed: Player) => removedPlayers.push(removed));
        network.addPlayer(player);

        // When
        webrtcMock.emitStates({ iceConnection: 'disconnected' });

        // Then
        expect(network.onPlayerDisconnectedSpy).toHaveBeenCalledWith(player);
        expect(removedPlayers).toEqual([player]);
        expect(webrtcMock.close).toHaveBeenCalledTimes(1);
        expect(network.isPlayerNameAlreadyInRoom('remote')).toEqual(false);
    });

    test('should clear a replaced player and ignore its disconnection', () => {
        // Given
        const disconnected$ = new Subject<void>();
        const replacedPlayer = TestHelper.cast<WebRtcPlayer>({
            name: 'remote',
            isLocal: false,
            message$: new Subject<ReceivedMessage>(),
            disconnected$,
            clear: vi.fn(),
        });
        const { player } = createPlayer('remote');
        const removedPlayers: Player[] = [];
        network.playerRemoved$.subscribe((removed: Player) => removedPlayers.push(removed));
        network.addPlayer(replacedPlayer);

        // When
        network.addPlayer(player);
        disconnected$.next();

        // Then
        expect(replacedPlayer.clear).toHaveBeenCalledTimes(1);
        expect(removedPlayers).toEqual([]);
        expect(network.onPlayerDisconnectedSpy).not.toHaveBeenCalled();
        expect(network.isPlayerNameAlreadyInRoom('remote')).toEqual(true);
    });

    test('clear should clear players and negotiators and complete the streams', () => {
        // Given
        const { player, webrtcMock } = createPlayer('remote');
        const { negotiator } = createNegotiator('pending');
        network.addPlayer(player);
        network.addNegotiator(negotiator);
        const completeSpy = vi.fn();
        network.onMessage$.subscribe({ complete: completeSpy });
        network.playerAdded$.subscribe({ complete: completeSpy });
        network.playerRemoved$.subscribe({ complete: completeSpy });
        network.queueAdded$.subscribe({ complete: completeSpy });
        network.queueRemoved$.subscribe({ complete: completeSpy });

        // When
        network.clear();

        // Then
        expect(webrtcMock.close).toHaveBeenCalledTimes(1);
        expect(negotiator.clear).toHaveBeenCalledTimes(1);
        expect(completeSpy).toHaveBeenCalledTimes(5);
    });
});
