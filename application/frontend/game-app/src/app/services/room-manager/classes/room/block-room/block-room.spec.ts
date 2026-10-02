import { BlockChainRouting, BlockRoom, mergeBlockChainRoutings } from './block-room';
import { Block } from './block-chain/block';
import { DistributedBlockChain } from './block-chain/distributed-block-chain';
import { ParticipantKeys, ParticipantRegistry } from './block-chain/participant-registry';
import { BlockChainName } from './block-chain-name.enum';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { BlockChainMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import { BlockRoomParticipantMessageType } from '@app/services/room-manager/classes/webrtc/messages/block-room-participant-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

interface TestPayloads {
    move: string;
    promotion: string;
    chat: string;
}

const routing: BlockChainRouting<TestPayloads> = { move: BlockChainName.CHESS, promotion: BlockChainName.CHESS, chat: BlockChainName.CHAT };

function chainName(context: unknown): string {
    return TestHelper.cast<DistributedBlockChain>(context).name;
}

describe('BlockRoom', () => {
    let keys: ParticipantKeys;
    let network: RoomNetworkMock;
    let roomApi: RoomSocketApi;
    const players: WebRtcPlayer[] = [];

    beforeAll(async () => {
        keys = await BlockRoom.createKeys();
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        network = new RoomNetworkMock();
        roomApi = TestHelper.cast<RoomSocketApi>({ close: vi.fn() });
    });

    afterEach(() => {
        players.splice(0).forEach((player: WebRtcPlayer) => player.clear());
        vi.restoreAllMocks();
    });

    function createRoom(): BlockRoom<TestPayloads> {
        return new BlockRoom<TestPayloads>(roomApi, network.roomNetwork, keys, routing);
    }

    test('createKeys should create a signing key pair', () => {
        expect(keys.keyPair.privateKey.usages).toEqual(['sign']);
    });

    test('should reject an empty routing at compile time', () => {
        // @ts-expect-error a routing without message type could not carry any message
        const build = (): BlockRoom<object> => new BlockRoom<object>(roomApi, network.roomNetwork, keys, {});

        expect(build).toBeTypeOf('function');
    });

    test('mergeBlockChainRoutings should merge the routings of several features', () => {
        expect(mergeBlockChainRoutings<{ move: string }, { chat: string }>({ move: BlockChainName.CHESS }, { chat: BlockChainName.CHAT }))
            .toEqual({ move: BlockChainName.CHESS, chat: BlockChainName.CHAT });
    });

    test('mergeBlockChainRoutings should refuse a message type routed twice', () => {
        expect(() => mergeBlockChainRoutings<{ move: string; chat: string }, { chat: string }>({ move: BlockChainName.CHESS, chat: BlockChainName.CHAT }, { chat: BlockChainName.CHESS }))
            .toThrow('Message types routed twice: chat');
    });

    test('should deliver the approved messages through the block chain', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => expect(moves).toEqual([{ from: 'local', type: 'move', payload: 'e4' }]));
    });

    test('should agree on the messages of each chain independently', async () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const notifyMessageSpy = vi.spyOn(room, 'notifyMessage');

        // When
        room.transmitMessage('chat', 'hello');
        room.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => expect(notifyMessageSpy).toHaveBeenCalledTimes(2));
        // A chat block does not take the place of a game block: both are the first block of their chain
        expect(notifyMessageSpy.mock.calls.map(([block]: [Block]) => [block.index, block.data.type])).toEqual(expect.arrayContaining([[1, 'chat'], [1, 'move']]));
    });

    test('should transmit each message type through its own chain', () => {
        // Given
        const transmitMessageSpy = vi.spyOn(DistributedBlockChain.prototype, 'transmitMessage').mockResolvedValue();
        const room: BlockRoom<TestPayloads> = createRoom();

        // When
        room.transmitMessage('move', 'e4');
        room.transmitMessage('promotion', 'queen');
        room.transmitMessage('chat', 'hello');

        // Then
        expect(transmitMessageSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHESS, BlockChainName.CHAT]);
        expect(transmitMessageSpy.mock.contexts[0]).toBe(transmitMessageSpy.mock.contexts[1]);
    });

    test('should refuse to transmit a message type without block chain', () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();

        // When / Then
        expect(() => room.transmitMessage(TestHelper.cast<'move'>('unknown'), 'e4')).toThrow('No block chain routes the unknown messages');
    });

    test('notifyMessage should publish the block data', () => {
        // Given
        const room: BlockRoom<TestPayloads> = createRoom();
        const data: AppMessage = { from: 'remote', type: 'move', payload: 'd5' };
        const moves: AppMessage[] = [];
        room.messenger('move').subscribe((message: AppMessage) => moves.push(message));

        // When
        room.notifyMessage(new Block(1, '', data, '', '', ''));

        // Then
        expect(moves).toEqual([data]);
    });

    test('should dispatch the network messages to the participants or to their block chain', () => {
        // Given
        const participantHandleSpy = vi.spyOn(ParticipantRegistry.prototype, 'handle').mockImplementation(() => undefined);
        const chainHandleSpy = vi.spyOn(DistributedBlockChain.prototype, 'handle').mockImplementation(() => undefined);
        createRoom();
        const participantMessage: ReceivedMessage = { type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, payload: { publicKey: {}, nbParticipants: 1 }, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT, from: 'remote' };
        const chatMessage: ReceivedMessage = { type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST, payload: null, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHAT, from: 'remote' };

        // When
        network.onMessage$.next(participantMessage);
        network.onMessage$.next(chatMessage);
        network.onMessage$.next({ type: 'move', payload: 'e4', origin: MessageOriginType.ROOM_SERVICE, from: 'remote' });

        // Then
        expect(participantHandleSpy.mock.calls).toEqual([[participantMessage]]);
        expect(chainHandleSpy.mock.calls).toEqual([[chatMessage]]);
        expect(chainHandleSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHAT]);
    });

    test('should log the messages of a block chain missing from the room', () => {
        // Given
        const chainHandleSpy = vi.spyOn(DistributedBlockChain.prototype, 'handle');
        new BlockRoom<{ move: string }>(roomApi, network.roomNetwork, keys, { move: BlockChainName.CHESS });

        // When
        network.onMessage$.next({ type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST, payload: null, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: BlockChainName.CHAT, from: 'remote' });

        // Then
        expect(chainHandleSpy).not.toHaveBeenCalled();
        expect(TimedLogger.error).toHaveBeenCalledWith('No chat block chain in this room, message from remote');
    });

    test('should negotiate the new players once for all the block chains', async () => {
        // Given
        const onParticipantReadySpy = vi.spyOn(DistributedBlockChain.prototype, 'onParticipantReady').mockImplementation(() => undefined);
        const room: BlockRoom<TestPayloads> = createRoom();
        const remote = TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() });
        const publicKey: JsonWebKey = keys.publicJwk;

        // When
        network.playerAdded$.next(remote);
        network.onMessage$.next({
            type: BlockRoomParticipantMessageType.NEGOTIATION_RESPONSE,
            payload: { publicKey, nbParticipants: 2 },
            origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT,
            from: 'remote',
        });

        // Then
        expect(room.players()).toEqual([network.localPlayer, remote]);
        expect(remote.sendData).toHaveBeenCalledExactlyOnceWith({ type: BlockRoomParticipantMessageType.NEGOTIATION_REQUEST, payload: { publicKey, nbParticipants: 2 }, origin: MessageOriginType.BLOCK_ROOM_PARTICIPANT });
        await vi.waitFor(() => expect(onParticipantReadySpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHAT]));
        expect(onParticipantReadySpy).toHaveBeenCalledWith({ name: 'remote', nbParticipants: 2 });
    });

    test('should forget the participants who left and tell it to all the block chains', () => {
        // Given
        const onPlayerLeftSpy = vi.spyOn(ParticipantRegistry.prototype, 'onPlayerLeft');
        const onParticipantLeftSpy = vi.spyOn(DistributedBlockChain.prototype, 'onParticipantLeft').mockResolvedValue();
        const room: BlockRoom<TestPayloads> = createRoom();
        const remote = TestHelper.cast<Player>({ name: 'remote', isLocal: false, sendData: vi.fn() });
        network.playerAdded$.next(remote);

        // When
        network.playerRemoved$.next(remote);

        // Then
        expect(room.players()).toEqual([network.localPlayer]);
        expect(onPlayerLeftSpy).toHaveBeenCalledExactlyOnceWith(remote);
        expect(onParticipantLeftSpy.mock.contexts.map(chainName)).toEqual([BlockChainName.CHESS, BlockChainName.CHAT]);
        expect(onParticipantLeftSpy).toHaveBeenCalledWith('remote');
    });

    test('clear should clear the room, the participants and the block chains', () => {
        // Given
        const chainClearSpy = vi.spyOn(DistributedBlockChain.prototype, 'clear');
        const participantsClearSpy = vi.spyOn(ParticipantRegistry.prototype, 'clear');
        const room: BlockRoom<TestPayloads> = createRoom();

        // When
        room.clear();

        // Then
        expect(network.clear).toHaveBeenCalledTimes(1);
        expect(roomApi.close).toHaveBeenCalledTimes(1);
        expect(participantsClearSpy).toHaveBeenCalledTimes(1);
        expect(chainClearSpy).toHaveBeenCalledTimes(2);
    });

    test('should share the messages of each chain between two peers', async () => {
        // Given
        const createPeer = (name: string): { network: RoomNetworkMock; room: BlockRoom<TestPayloads>; sent: NetworkMessage[] } => {
            const peerNetwork: RoomNetworkMock = new RoomNetworkMock(name);
            return { network: peerNetwork, room: new BlockRoom<TestPayloads>(roomApi, peerNetwork.roomNetwork, keys, routing), sent: [] };
        };
        const connect = (from: ReturnType<typeof createPeer>, to: ReturnType<typeof createPeer>): void => {
            const webrtcMock: WebrtcMock = new WebrtcMock();
            webrtcMock.sendMessage.mockImplementation((message: NetworkMessage) => {
                from.sent.push(message);
                const received: ReceivedMessage = { ...JSON.parse(JSON.stringify(message)), from: from.network.localPlayer.name };
                setTimeout(() => to.network.onMessage$.next(received));
                return 1;
            });
            const player: WebRtcPlayer = new WebRtcPlayer(to.network.localPlayer.name, webrtcMock.webrtc);
            players.push(player);
            from.network.playerAdded$.next(player);
        };
        const peerA = createPeer('a');
        const peerB = createPeer('b');
        const received: AppMessage[] = [];
        peerB.room.messenger('chat').subscribe((message: AppMessage) => received.push(message));
        peerB.room.messenger('move').subscribe((message: AppMessage) => received.push(message));
        connect(peerA, peerB);
        connect(peerB, peerA);
        await vi.waitFor(() => expect(peerA.sent.filter((message: NetworkMessage) => message.type === BlockChainMessageType.GET_LAST_BLOCK_RESPONSE)).toHaveLength(2));

        // When
        peerA.room.transmitMessage('chat', 'hello');
        peerA.room.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => expect(received).toHaveLength(2));
        expect(received).toEqual(expect.arrayContaining([
            { from: 'a', type: 'chat', payload: 'hello' },
            { from: 'a', type: 'move', payload: 'e4' },
        ]));
        // The public key is negotiated once, whatever the number of chains
        expect(peerA.sent.filter((message: NetworkMessage) => message.type === BlockRoomParticipantMessageType.NEGOTIATION_REQUEST)).toHaveLength(1);
        peerA.room.clear();
        peerB.room.clear();
    });
});
