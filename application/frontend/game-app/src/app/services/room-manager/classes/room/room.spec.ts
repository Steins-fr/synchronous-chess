import { Room } from './room';
import { Negotiator } from '../negotiator/negotiator';
import { Player } from '../player/player';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { CheatReason } from './block-room/anti-cheat/cheat-report';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';

interface TestPayloads {
    move: string;
    chat: number;
}

function createRemotePlayer(name: string): Player {
    return TestHelper.cast<Player>({ name, isLocal: false, sendData: vi.fn() });
}

describe('Room', () => {
    let network: RoomNetworkMock;
    let roomApi: RoomSocketApi;
    let room: Room<TestPayloads>;

    beforeEach(() => {
        network = new RoomNetworkMock();
        network.negotiators.set(new Map([['pending', TestHelper.cast<Negotiator>({})]]));
        roomApi = TestHelper.cast<RoomSocketApi>({ close: vi.fn() });
        room = new Room<TestPayloads>(roomApi, network.roomNetwork);
    });

    test('should expose the room network', () => {
        expect(room.localPlayer).toBe(network.localPlayer);
        expect(room.roomConnection).toBe(network.roomNetwork);
        expect(room.playerAdded$).toBe(network.playerAdded$);
        expect(room.playerRemoved$).toBe(network.playerRemoved$);
        expect(room.initiator).toEqual(true);
        expect(room.roomName).toEqual('room');
        expect(room.hostName).toEqual('host');
        expect(room.players()).toEqual([network.localPlayer]);
        expect(room.queue()).toEqual(['pending']);
    });

    test('should follow the players of the room', () => {
        // Given
        const remote: Player = createRemotePlayer('remote');
        const reconnected: Player = createRemotePlayer('remote');

        // When
        network.playerAdded$.next(remote);
        network.playerAdded$.next(reconnected);

        // Then
        expect(room.players()).toEqual([network.localPlayer, reconnected]);

        // When
        network.playerRemoved$.next(reconnected);

        // Then
        expect(room.players()).toEqual([network.localPlayer]);
    });

    test('should follow the negotiation queue', () => {
        // When
        network.queueAdded$.next('newcomer');
        network.queueAdded$.next('newcomer');
        network.queueRemoved$.next('pending');

        // Then
        expect(room.queue()).toEqual(['newcomer']);
    });

    test('should deliver the room service messages to the messenger', () => {
        // Given
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        network.onMessage$.next({ type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
        network.onMessage$.next({ type: 'chat', payload: 1, origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });
        network.onMessage$.next({ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 }, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHESS, from: 'remote' });

        // Then
        expect(moves).toEqual([{ type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE, from: 'remote' }]);
    });

    test('reportCheat should only log, without anti-cheat', () => {
        // Given
        const warnSpy = vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        const room: Room<TestPayloads> = new Room<TestPayloads>(roomApi, network.roomNetwork);
        const message: AppMessage = { from: 'remote', type: 'move', payload: 'e9' };

        // When
        room.reportCheat(message, CheatReason.ILLEGAL_MOVE);

        // Then
        expect(warnSpy).toHaveBeenCalledWith('Cheat not reported, illegalMove by remote', message);
        warnSpy.mockRestore();
    });

    test('transmitMessage should send the message to the remote players and to itself', () => {
        // Given
        const remote: Player = createRemotePlayer('remote');
        network.playerAdded$.next(remote);
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.transmitMessage('move', 'e4');

        // Then
        expect(remote.sendData).toHaveBeenCalledWith({ type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE });
        expect(moves).toEqual([{ from: 'local', type: 'move', payload: 'e4' }]);
    });

    test('clear should stop following the network and close the api', () => {
        // When
        room.clear();
        network.queueAdded$.next('newcomer');

        // Then
        expect(network.clear).toHaveBeenCalledTimes(1);
        expect(roomApi.close).toHaveBeenCalledTimes(1);
        expect(room.queue()).toEqual(['pending']);
    });
});
