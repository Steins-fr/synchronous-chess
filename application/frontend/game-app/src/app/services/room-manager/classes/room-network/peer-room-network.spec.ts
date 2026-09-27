import { PeerRoomNetwork } from './peer-room-network';
import { Negotiator } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomSocketApi, RoomSocketApiNotifications } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';
import { TestHelper } from '@testing/test.helper';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

class TestPeerRoomNetwork extends PeerRoomNetwork {
    public get host(): Player | undefined {
        return this.hostPlayer;
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
        network = new TestPeerRoomNetwork(roomSocketApi, 'room', 'local', 'host');
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

    test('should throw on unknown host room message', () => {
        // When
        const call = (): void => network.onRoomMessage({ type: 'unknown' as HostRoomMessageType, payload: { playerName: 'a' }, origin: MessageOriginType.HOST_ROOM, from: 'host' } as ReceivedMessage);

        // Then
        expect(call).toThrow('Unhandled switch case');
    });
});
