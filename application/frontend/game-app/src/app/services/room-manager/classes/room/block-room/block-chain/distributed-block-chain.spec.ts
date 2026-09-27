import { BlockChainState, DistributedBlockChain } from './distributed-block-chain';
import { Block } from './block';
import { BlockToHash, Chain } from './chain';
import { Participant } from './participant';
import { WaitingQueue } from './waiting-queue';
import { BlockRoomInterface } from '../block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import {
    BlockChainMessage,
    BlockChainMessageType,
    BlockChainPayloads,
    ReceivedBlockChainMessage
} from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage, ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

type Handler<K extends BlockChainMessageType> = (message: ReceivedBlockChainMessage<K>) => Promise<BlockChainState>;

interface DistributedBlockChainInternals {
    blockChain: Chain;
    participants: Map<string, Participant>;
    blocksToValidate: WaitingQueue;
    state: BlockChainState;
    localBlock?: Block;
    approveBlockFor(block: Block, participant: Participant): Promise<void>;
    declineBlockFor(block: Block, participant: Participant): Promise<void>;
    transmitLocalBlock(playerData?: AppMessage): Promise<void>;
    sendBlock(block: Block, type: BlockChainMessageType.NEW_BLOCK_APPROVED | BlockChainMessageType.NEW_BLOCK_DECLINED): void;
    onNegotiationRequest: Handler<BlockChainMessageType.NEGOTIATION_REQUEST>;
    onNegotiationResponse: Handler<BlockChainMessageType.NEGOTIATION_RESPONSE>;
    onNewBlockApproved: Handler<BlockChainMessageType.NEW_BLOCK_APPROVED>;
    onNewBlockDeclined: Handler<BlockChainMessageType.NEW_BLOCK_DECLINED>;
    onGetLastBlockRequest: Handler<BlockChainMessageType.GET_LAST_BLOCK_REQUEST>;
    onGetLastBlockResponse: Handler<BlockChainMessageType.GET_LAST_BLOCK_RESPONSE>;
    onGetBlocksRequest: Handler<BlockChainMessageType.GET_BLOCKS_REQUEST>;
    onGetBlocksResponse: Handler<BlockChainMessageType.GET_BLOCKS_RESPONSE>;
}

interface Node {
    chain: DistributedBlockChain;
    internals: DistributedBlockChainInternals;
    room: { localPlayer?: LocalPlayer; notifyMessage: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
    remote: WebrtcMock;
    local: Participant;
    remoteParticipant: Participant;
}

let localKeyPair: CryptoKeyPair;
let remoteKeyPair: CryptoKeyPair;
const players: WebRtcPlayer[] = [];

function internalsOf(chain: DistributedBlockChain): DistributedBlockChainInternals {
    return TestHelper.cast<DistributedBlockChainInternals>(chain);
}

function receivedMessage<K extends BlockChainMessageType>(type: K, payload: BlockChainPayloads[K], from: string = 'b'): ReceivedBlockChainMessage<K> {
    return TestHelper.cast<ReceivedBlockChainMessage<K>>({ type, payload, origin: MessageOriginType.BLOCK_ROOM_SERVICE, from });
}

function sentMessages(webrtcMock: WebrtcMock): BlockChainMessage[] {
    return webrtcMock.sendMessage.mock.calls
        .map((call: unknown[]) => call[0] as NetworkMessage)
        .filter((message: NetworkMessage): message is BlockChainMessage => message.origin === MessageOriginType.BLOCK_ROOM_SERVICE);
}

function sentTypes(webrtcMock: WebrtcMock): BlockChainMessageType[] {
    return sentMessages(webrtcMock).map((message: BlockChainMessage) => message.type);
}

async function createSignedBlock(previous: Block, from: string, keyPair: CryptoKeyPair, payload: unknown = 1): Promise<Block> {
    const data: AppMessage = { from, type: 'move', payload };
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, timestamp: '', data };
    const hash: string = await Chain.calculateHash(blockToHash);
    return new Block(blockToHash.index, '', data, previous.hash, hash, await Chain.signHash(hash, keyPair.privateKey));
}

async function createNode(options: { withLocal?: boolean; withLocalPlayer?: boolean } = {}): Promise<Node> {
    const { withLocal = true, withLocalPlayer = true } = options;
    const localPlayer: LocalPlayer = new LocalPlayer('a');
    const room = { localPlayer: withLocalPlayer ? localPlayer : undefined, notifyMessage: vi.fn(), clear: vi.fn() };
    const chain: DistributedBlockChain = new DistributedBlockChain(TestHelper.cast<BlockRoomInterface>(room), localKeyPair);
    const internals: DistributedBlockChainInternals = internalsOf(chain);
    await internals.blockChain.reset();

    if (withLocal) {
        chain.onNewPlayer(localPlayer);
    }

    const remote: WebrtcMock = new WebrtcMock();
    const remotePlayer: WebRtcPlayer = new WebRtcPlayer('b', remote.webrtc);
    players.push(remotePlayer);
    chain.onNewPlayer(remotePlayer);

    const remoteParticipant: Participant = internals.participants.get('b') as Participant;
    remoteParticipant.publicKey = remoteKeyPair.publicKey;

    return {
        chain,
        internals,
        room,
        remote,
        local: internals.participants.get('a') as Participant,
        remoteParticipant,
    };
}

describe('DistributedBlockChain', () => {
    beforeAll(async () => {
        localKeyPair = await DistributedBlockChain.createKeyPair();
        remoteKeyPair = await DistributedBlockChain.createKeyPair();
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'trace').mockImplementation(() => undefined);
    });

    afterEach(() => {
        players.splice(0).forEach((player: WebRtcPlayer) => player.clear());
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('createKeyPair should create an ECDSA key pair', () => {
        expect(localKeyPair.privateKey.algorithm.name).toEqual('ECDSA');
        expect(localKeyPair.publicKey.usages).toEqual(['verify']);
    });

    test('should request the public key of a new remote player', async () => {
        // Given
        const { remote } = await createNode();

        // When / Then
        expect(sentMessages(remote)).toEqual([{ type: BlockChainMessageType.NEGOTIATION_REQUEST, payload: null, origin: MessageOriginType.BLOCK_ROOM_SERVICE }]);
    });

    test('should answer a negotiation request with the public key', async () => {
        // Given
        const { internals, remote } = await createNode();

        // When
        const state: BlockChainState = await internals.onNegotiationRequest(receivedMessage(BlockChainMessageType.NEGOTIATION_REQUEST, null));

        // Then
        const response: BlockChainMessage = sentMessages(remote)[1];
        expect(state).toEqual(BlockChainState.INITIALISING);
        expect(response.type).toEqual(BlockChainMessageType.NEGOTIATION_RESPONSE);
        expect(response.payload).toEqual({ nbParticipants: 2, publicKey: await crypto.subtle.exportKey('jwk', localKeyPair.publicKey) });
    });

    test('should request the last block once enough participants are ready', async () => {
        // Given
        const { chain, internals, remote } = await createNode();
        const publicKey: JsonWebKey = await crypto.subtle.exportKey('jwk', remoteKeyPair.publicKey);
        const notReadyPlayer: WebRtcPlayer = new WebRtcPlayer('c', new WebrtcMock().webrtc);
        players.push(notReadyPlayer);
        chain.onNewPlayer(notReadyPlayer);

        // When
        const unknownState: BlockChainState = await internals.onNegotiationResponse(receivedMessage(BlockChainMessageType.NEGOTIATION_RESPONSE, { publicKey, nbParticipants: 2 }, 'unknown'));
        const notEnoughState: BlockChainState = await internals.onNegotiationResponse(receivedMessage(BlockChainMessageType.NEGOTIATION_RESPONSE, { publicKey, nbParticipants: 4 }));
        const readyState: BlockChainState = await internals.onNegotiationResponse(receivedMessage(BlockChainMessageType.NEGOTIATION_RESPONSE, { publicKey, nbParticipants: 2 }));

        // Then
        expect(unknownState).toEqual(BlockChainState.INITIALISING);
        expect(notEnoughState).toEqual(BlockChainState.INITIALISING);
        expect(readyState).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEGOTIATION_REQUEST, BlockChainMessageType.GET_LAST_BLOCK_REQUEST]);
    });

    test('should answer the last block request', async () => {
        // Given
        const { internals, remote } = await createNode();

        // When
        await internals.onGetLastBlockRequest(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_REQUEST, null));
        await internals.onGetLastBlockRequest(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_REQUEST, null, 'unknown'));

        // Then
        expect(sentMessages(remote)[1]).toEqual({
            type: BlockChainMessageType.GET_LAST_BLOCK_RESPONSE,
            payload: internals.blockChain.getLatestBlock(),
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
        });
        expect(sentMessages(remote)).toHaveLength(2);
    });

    test('should request the missing blocks of an outdated chain', async () => {
        // Given
        const { internals, remote } = await createNode();
        const genesis: Block = internals.blockChain.getLatestBlock();
        const block1: Block = await createSignedBlock(genesis, 'b', remoteKeyPair);
        const block2: Block = await createSignedBlock(block1, 'b', remoteKeyPair);
        const olderBlock: Block = new Block(0, '', genesis.data, '', 'other', '');

        // When
        const upToDate: BlockChainState = await internals.onGetLastBlockResponse(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, genesis));
        const older: BlockChainState = await internals.onGetLastBlockResponse(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, olderBlock));
        const outdated: BlockChainState = await internals.onGetLastBlockResponse(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, block2));

        // Then
        expect(upToDate).toEqual(BlockChainState.UP_TO_DATE);
        expect(older).toEqual(BlockChainState.UP_TO_DATE);
        expect(outdated).toEqual(BlockChainState.OUTDATED);
        expect(sentMessages(remote)[1]).toEqual({
            type: BlockChainMessageType.GET_BLOCKS_REQUEST,
            payload: { from: 1, to: 2 },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
        });
    });

    test('should answer the blocks request', async () => {
        // Given
        const { internals, remote } = await createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        await internals.blockChain.addBlock(block1);

        // When
        const state: BlockChainState = await internals.onGetBlocksRequest(receivedMessage(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 0, to: 1 }));

        // Then
        expect(state).toEqual(BlockChainState.INITIALISING);
        expect(sentMessages(remote)[1].payload).toEqual([internals.blockChain.getBlock(0), block1]);
    });

    test('should add the received blocks until an invalid one', async () => {
        // Given
        const { internals, remote, room } = await createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 1);
        const block2: Block = await createSignedBlock(block1, 'b', remoteKeyPair, 2);
        const invalidBlock: Block = await createSignedBlock(block1, 'b', remoteKeyPair, 3);

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2, invalidBlock, block2]));

        // Then
        expect(state).toEqual(BlockChainState.OUTDATED);
        expect(room.notifyMessage).toHaveBeenCalledTimes(2);
        expect(room.notifyMessage).toHaveBeenNthCalledWith(1, block1);
        expect(room.notifyMessage).toHaveBeenNthCalledWith(2, block2);
        expect(TimedLogger.error).toHaveBeenCalledWith('break');
        expect(sentTypes(remote)[1]).toEqual(BlockChainMessageType.GET_LAST_BLOCK_REQUEST);
    });

    test('should log the errors of the blocks response', async () => {
        // Given
        const { internals } = await createNode();

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, TestHelper.cast<ReadonlyArray<Block>>(null)));

        // Then
        expect(state).toEqual(BlockChainState.OUTDATED);
        expect(TimedLogger.error).toHaveBeenCalledWith(expect.stringContaining('Multiple response'), expect.any(TypeError));
    });

    test('should ignore approvals involving unknown participants', async () => {
        // Given
        const { internals, room } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'unknown', remoteKeyPair);

        // When
        const unknownAuthor: BlockChainState = await internals.onNewBlockApproved(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));
        const unknownApprover: BlockChainState = await internals.onNewBlockApproved(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block, 'unknown'));
        const unknownDecliner: BlockChainState = await internals.onNewBlockDeclined(receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));

        // Then
        expect(unknownAuthor).toEqual(BlockChainState.UP_TO_DATE);
        expect(unknownApprover).toEqual(BlockChainState.UP_TO_DATE);
        expect(unknownDecliner).toEqual(BlockChainState.UP_TO_DATE);
        expect(internals.blocksToValidate.hasBlock(block)).toEqual(false);
        expect(room.notifyMessage).not.toHaveBeenCalled();
    });

    test('should approve a valid block of a remote participant', async () => {
        // Given
        const { internals, remote, room } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.onNewBlockApproved(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(state).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentTypes(remote)[1]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledWith(block));
        expect(internals.blockChain.getLatestBlock()).toBe(block);
    });

    test('should reject a block with an invalid signature', async () => {
        // Given
        const { internals } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', localKeyPair);

        // When / Then
        await expect(internals.onNewBlockApproved(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block)))
            .rejects.toThrow('Someone try to play as another player');
        await expect(internals.onNewBlockDeclined(receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block)))
            .rejects.toThrow('Someone try to play as another player');
    });

    test('should register the decline of a block and approve it locally', async () => {
        // Given
        const { internals, remote, remoteParticipant } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.onNewBlockDeclined(receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));
        await internals.declineBlockFor(block, remoteParticipant);

        // Then
        expect(state).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEGOTIATION_REQUEST, BlockChainMessageType.NEW_BLOCK_APPROVED]);
        expect(internals.blocksToValidate.hasDeclinedBlock(block, remoteParticipant)).toEqual(true);
    });

    test('should decline a block concurrent to a block with a lower hash', async () => {
        // Given
        const { internals, remote, local, remoteParticipant } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const otherBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 2);
        const lowerBlock: Block = new Block(1, '', block.data, '', '', '');
        internals.blocksToValidate.approveBlock(lowerBlock, local);

        // When
        await internals.declineBlockFor(block, remoteParticipant);
        await internals.approveBlockFor(otherBlock, remoteParticipant);

        // Then
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEGOTIATION_REQUEST, BlockChainMessageType.NEW_BLOCK_DECLINED, BlockChainMessageType.NEW_BLOCK_DECLINED]);
    });

    test('should throw if the local participant is missing', async () => {
        // Given
        const { internals, remoteParticipant } = await createNode({ withLocal: false });
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When / Then
        await expect(internals.approveBlockFor(block, remoteParticipant)).rejects.toThrow('Local participant is not defined');
        await expect(internals.declineBlockFor(block, remoteParticipant)).rejects.toThrow('Local participant is not defined');
    });

    test('should decline a block which can not be added', async () => {
        // Given
        const { internals, remote, remoteParticipant } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const invalidBlock: Block = new Block(1, '', block.data, 'wrong', block.hash, block.signature);

        // When
        await internals.approveBlockFor(invalidBlock, remoteParticipant);

        // Then
        expect(sentTypes(remote)[1]).toEqual(BlockChainMessageType.NEW_BLOCK_DECLINED);
        expect(internals.blocksToValidate.hasDeclinedBlock(invalidBlock, internals.participants.get('a') as Participant)).toEqual(true);
    });

    test('should not decline an already approved block which can not be added anymore', async () => {
        // Given
        const { internals, remote, remoteParticipant, room } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        await internals.approveBlockFor(block, remoteParticipant);
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledTimes(1));
        const sentCount: number = sentMessages(remote).length;

        // When
        await internals.approveBlockFor(block, remoteParticipant);

        // Then
        expect(sentMessages(remote)).toHaveLength(sentCount);
        expect(TimedLogger.log).toHaveBeenCalledWith('decline', block);
    });

    test('should transmit again an outdated local block', async () => {
        // Given
        const { internals, remote, remoteParticipant } = await createNode();
        const remoteBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const localBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'a', localKeyPair);
        await internals.blockChain.addBlock(remoteBlock);
        internals.localBlock = localBlock;

        // When
        await internals.approveBlockFor(localBlock, remoteParticipant);

        // Then
        expect(internals.localBlock?.index).toEqual(2);
        expect(internals.localBlock?.previousHash).toEqual(remoteBlock.hash);
        expect(sentTypes(remote)[1]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
    });

    test('should transmit again the pending local block once another block is approved', async () => {
        // Given
        const { internals, remoteParticipant, room } = await createNode();
        const remoteBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const localBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'a', localKeyPair, 2);
        internals.localBlock = localBlock;

        // When
        await internals.approveBlockFor(remoteBlock, remoteParticipant);

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledTimes(2));
        expect(room.notifyMessage).toHaveBeenNthCalledWith(1, remoteBlock);
        expect(TimedLogger.log).toHaveBeenCalledWith('transmit local');
        expect(internals.blockChain.getLatestBlock().data).toEqual(localBlock.data);
        expect(internals.localBlock).toBeUndefined();
    });

    test('should log the failure to add an approved block', async () => {
        // Given
        const { internals, remoteParticipant, room } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        vi.spyOn(Chain.prototype, 'addBlock').mockRejectedValueOnce('add failure');

        // When
        await internals.approveBlockFor(block, remoteParticipant);

        // Then
        await vi.waitFor(() => expect(TimedLogger.log).toHaveBeenCalledWith('add failure'));
        expect(room.notifyMessage).not.toHaveBeenCalled();
    });

    test('transmitMessage should create, approve and notify a local block', async () => {
        // Given
        const { chain, remote, room } = await createNode();

        // When
        await chain.transmitMessage('move', 42);

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledTimes(1));
        expect(room.notifyMessage.mock.calls[0][0].data).toEqual({ from: 'a', type: 'move', payload: 42 });
        expect(sentTypes(remote)[1]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
    });

    test('transmitMessage should do nothing without local player', async () => {
        // Given
        const { chain, remote } = await createNode({ withLocalPlayer: false });

        // When
        await chain.transmitMessage('move', 42);

        // Then
        expect(sentMessages(remote)).toHaveLength(1);
    });

    test('should not transmit a local block without data or local participant', async () => {
        // Given
        const withLocal: Node = await createNode();
        const withoutLocal: Node = await createNode({ withLocal: false });

        // When
        await withLocal.internals.transmitLocalBlock();
        await withoutLocal.internals.transmitLocalBlock({ from: 'a', type: 'move', payload: 1 });

        // Then
        expect(TimedLogger.trace).toHaveBeenCalledTimes(2);
        expect(sentMessages(withLocal.remote)).toHaveLength(1);
        expect(sentMessages(withoutLocal.remote)).toHaveLength(1);
    });

    test('should delay the blocks when a latency is configured', async () => {
        // Given
        const { internals, remote } = await createNode();
        const block: Block = internals.blockChain.getLatestBlock();
        window.history.pushState({}, '', '/?latency=50');
        vi.useFakeTimers();

        // When
        internals.sendBlock(block, BlockChainMessageType.NEW_BLOCK_APPROVED);
        const sentBeforeLatency: number = sentMessages(remote).length;
        vi.advanceTimersByTime(50);
        window.history.pushState({}, '', '/');

        // Then
        expect(sentBeforeLatency).toEqual(1);
        expect(sentMessages(remote)[1]).toEqual({ type: BlockChainMessageType.NEW_BLOCK_APPROVED, payload: block, origin: MessageOriginType.BLOCK_ROOM_SERVICE });
    });

    test('should handle the block room messages and catch up when outdated', async () => {
        // Given
        const { chain, internals, remote } = await createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        chain.onMessage({ type: 'other', payload: null, origin: MessageOriginType.ROOM_SERVICE, from: 'b' });
        chain.onMessage(TestHelper.cast<ReceivedMessage>(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, block1)));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toEqual([
            BlockChainMessageType.NEGOTIATION_REQUEST,
            BlockChainMessageType.GET_BLOCKS_REQUEST,
            BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
        ]));
        expect(internals.state).toEqual(BlockChainState.OUTDATED);

        // When
        chain.initiate();
        chain.onMessage(TestHelper.cast<ReceivedMessage>(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, block1)));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toHaveLength(5));
        expect(sentTypes(remote)[4]).toEqual(BlockChainMessageType.GET_BLOCKS_REQUEST);
    });

    test('should dispatch the blocks messages to their handler', async () => {
        // Given
        const { chain, internals, remote } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'unknown', remoteKeyPair);

        // When
        chain.onMessage(TestHelper.cast<ReceivedMessage>(receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block)));
        chain.onMessage(TestHelper.cast<ReceivedMessage>(receivedMessage(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 0, to: 0 })));
        chain.onMessage(TestHelper.cast<ReceivedMessage>(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [])));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toEqual(expect.arrayContaining([
            BlockChainMessageType.GET_BLOCKS_RESPONSE,
            BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
        ])));
        expect(internals.blocksToValidate.hasBlock(block)).toEqual(false);
    });

    test('should log the messages which can not be handled', async () => {
        // Given
        const { chain, internals } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', localKeyPair);

        // When
        chain.handle(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ BlockChainMessageType.NEW_BLOCK_APPROVED } from b`, expect.any(Error)));
    });

    test('initiate should do nothing without remote participant', async () => {
        // Given
        const { chain, internals, remote } = await createNode();
        internals.participants.delete('b');
        internals.state = BlockChainState.OUTDATED;

        // When
        chain.initiate();

        // Then
        expect(sentMessages(remote)).toHaveLength(1);
    });

    test('clear should reset the block chain', async () => {
        // Given
        const { chain, internals } = await createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        await internals.blockChain.addBlock(block);
        internals.state = BlockChainState.UP_TO_DATE;

        // When
        chain.clear();

        // Then
        await vi.waitFor(() => expect(internals.blockChain.getLatestBlock().index).toEqual(0));
        expect(internals.participants.size).toEqual(0);
        expect(internals.state).toEqual(BlockChainState.INITIALISING);
        expect(internals.localBlock).toBeUndefined();
    });

    test('should share a block between two participants', async () => {
        // Given
        const createPeer = (name: string, keyPair: CryptoKeyPair): { chain: DistributedBlockChain; notifyMessage: ReturnType<typeof vi.fn>; player: LocalPlayer } => {
            const player: LocalPlayer = new LocalPlayer(name);
            const notifyMessage = vi.fn();
            const chain: DistributedBlockChain = new DistributedBlockChain(TestHelper.cast<BlockRoomInterface>({ localPlayer: player, notifyMessage }), keyPair);
            chain.onNewPlayer(player);
            return { chain, notifyMessage, player };
        };
        const connect = (from: { chain: DistributedBlockChain; player: LocalPlayer }, to: { chain: DistributedBlockChain; player: LocalPlayer }): void => {
            const webrtcMock: WebrtcMock = new WebrtcMock();
            webrtcMock.sendMessage.mockImplementation((message: NetworkMessage) => {
                const received: ReceivedMessage = { ...JSON.parse(JSON.stringify(message)), from: from.player.name };
                setTimeout(() => to.chain.onMessage(received));
                return 1;
            });
            const player: WebRtcPlayer = new WebRtcPlayer(to.player.name, webrtcMock.webrtc);
            players.push(player);
            from.chain.onNewPlayer(player);
        };
        const peerA = createPeer('a', localKeyPair);
        const peerB = createPeer('b', remoteKeyPair);
        connect(peerA, peerB);
        connect(peerB, peerA);
        await vi.waitFor(() => {
            expect(internalsOf(peerA.chain).state).toEqual(BlockChainState.UP_TO_DATE);
            expect(internalsOf(peerB.chain).state).toEqual(BlockChainState.UP_TO_DATE);
        });

        // When
        await peerA.chain.transmitMessage('move', 'e4');

        // Then
        await vi.waitFor(() => {
            expect(peerA.notifyMessage).toHaveBeenCalledTimes(1);
            expect(peerB.notifyMessage).toHaveBeenCalledTimes(1);
        });
        expect(peerB.notifyMessage.mock.calls[0][0].data).toEqual({ from: 'a', type: 'move', payload: 'e4' });
    });
});
