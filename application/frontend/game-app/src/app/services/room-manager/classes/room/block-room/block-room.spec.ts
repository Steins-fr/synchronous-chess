import { BlockRoom } from './block-room';
import { Block } from './block-chain/block';
import { DistributedBlockChain } from './block-chain/distributed-block-chain';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '@app/services/room-manager/classes/player/player';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

interface TestPayloads {
    move: string;
}

describe('BlockRoom', () => {
    let keyPair: CryptoKeyPair;
    let network: RoomNetworkMock;
    let roomApi: RoomSocketApi;

    beforeAll(async () => {
        keyPair = await BlockRoom.createKeyPair();
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
        network = new RoomNetworkMock();
        roomApi = TestHelper.cast<RoomSocketApi>({ close: vi.fn() });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('createKeyPair should create a signing key pair', () => {
        expect(keyPair.privateKey.usages).toEqual(['sign']);
    });

    test('should deliver the approved messages through the block chain', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keyPair);
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => expect(moves).toEqual([{ from: 'local', type: 'move', payload: 'e4' }]));
    });

    test('notifyMessage should publish the block data', () => {
        // Given
        const room: BlockRoom<TestPayloads> = new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keyPair);
        const data: AppMessage = { from: 'remote', type: 'move', payload: 'd5' };
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.notifyMessage(new Block(1, '', data, '', '', ''));

        // Then
        expect(moves).toEqual([data]);
    });

    test('should forward the network messages and players to the block chain', () => {
        // Given
        const onMessageSpy = vi.spyOn(DistributedBlockChain.prototype, 'onMessage').mockImplementation(() => undefined);
        const onNewPlayerSpy = vi.spyOn(DistributedBlockChain.prototype, 'onNewPlayer').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keyPair);
        const message: ReceivedMessage = { type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE, from: 'remote' };
        const remote = TestHelper.cast<Player>({ name: 'remote', isLocal: false });

        // When
        network.onMessage$.next(message);
        network.playerAdded$.next(remote);

        // Then
        expect(onMessageSpy).toHaveBeenCalledWith(message);
        expect(onNewPlayerSpy).toHaveBeenCalledWith(network.localPlayer);
        expect(onNewPlayerSpy).toHaveBeenCalledWith(remote);
        expect(room.players()).toEqual([network.localPlayer, remote]);
    });

    test('clear should clear the room and the block chain', () => {
        // Given
        const clearSpy = vi.spyOn(DistributedBlockChain.prototype, 'clear');
        const room: BlockRoom<TestPayloads> = new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keyPair);

        // When
        room.clear();

        // Then
        expect(network.clear).toHaveBeenCalledTimes(1);
        expect(roomApi.close).toHaveBeenCalledTimes(1);
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });
});
