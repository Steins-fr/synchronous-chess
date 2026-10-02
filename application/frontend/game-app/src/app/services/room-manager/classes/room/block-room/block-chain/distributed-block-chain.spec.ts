import { BlockChainState, DistributedBlockChain } from './distributed-block-chain';
import { Block } from './block';
import { BlockToHash, Chain } from './chain';
import { Participant } from './participant';
import { ParticipantKeys, ParticipantRegistry } from './participant-registry';
import { WaitingQueue } from './waiting-queue';
import { BlockRoomInterface } from '../block-room.interface';
import { BlockChainName } from '../block-chain-name.enum';
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
import { NetworkMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

type Handler<K extends BlockChainMessageType> = (message: ReceivedBlockChainMessage<K>) => Promise<BlockChainState>;

interface DistributedBlockChainInternals {
    blockChain: Chain;
    blocksToValidate: WaitingQueue;
    state: BlockChainState;
    localBlock?: Block;
    approveBlockFor(block: Block, participant: Participant): Promise<void>;
    declineBlockFor(block: Block, participant: Participant): Promise<void>;
    transmitLocalBlock(playerData?: AppMessage): Promise<void>;
    initiate(): void;
    sendBlock(block: Block, type: BlockChainMessageType.NEW_BLOCK_APPROVED | BlockChainMessageType.NEW_BLOCK_DECLINED): void;
    messageHandler: { [K in BlockChainMessageType]: Handler<K> };
    votesWaitingForKey: Map<string, unknown[]>;
    onGetLastBlockRequest: Handler<BlockChainMessageType.GET_LAST_BLOCK_REQUEST>;
    onGetLastBlockResponse: Handler<BlockChainMessageType.GET_LAST_BLOCK_RESPONSE>;
    onGetBlocksRequest: Handler<BlockChainMessageType.GET_BLOCKS_REQUEST>;
    onGetBlocksResponse: Handler<BlockChainMessageType.GET_BLOCKS_RESPONSE>;
}

interface Node {
    chain: DistributedBlockChain;
    internals: DistributedBlockChainInternals;
    room: { notifyMessage: ReturnType<typeof vi.fn> };
    participants: ParticipantRegistry;
    remote: WebrtcMock;
    local: Participant;
    remoteParticipant: Participant;
}

let localKeys: ParticipantKeys;
let localKeyPair: CryptoKeyPair;
let remoteKeyPair: CryptoKeyPair;
const players: WebRtcPlayer[] = [];
const chainName: BlockChainName = BlockChainName.CHESS;
const routing: ReadonlyMap<string, BlockChainName> = new Map([['move', chainName], ['chat', BlockChainName.CHAT]]);

function internalsOf(chain: DistributedBlockChain): DistributedBlockChainInternals {
    return TestHelper.cast<DistributedBlockChainInternals>(chain);
}

function receivedMessage<K extends BlockChainMessageType>(type: K, payload: BlockChainPayloads[K], from: string = 'b'): ReceivedBlockChainMessage<K> {
    return TestHelper.cast<ReceivedBlockChainMessage<K>>({ type, payload, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName, from });
}

function sentMessages(webrtcMock: WebrtcMock): BlockChainMessage[] {
    return webrtcMock.sendMessage.mock.calls
        .map((call: unknown[]) => call[0] as NetworkMessage)
        .filter((message: NetworkMessage): message is BlockChainMessage => message.origin === MessageOriginType.BLOCK_ROOM_SERVICE);
}

function sentTypes(webrtcMock: WebrtcMock): BlockChainMessageType[] {
    return sentMessages(webrtcMock).map((message: BlockChainMessage) => message.type);
}

async function createSignedBlock(previous: Block, from: string, keyPair: CryptoKeyPair, payload: unknown = 1, options: { chain?: BlockChainName; type?: string } = {}): Promise<Block> {
    const { chain = chainName, type = 'move' } = options;
    const data: AppMessage = { from, type, payload };
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, timestamp: '', data };
    const hash: string = await Chain.calculateHash(chain, blockToHash);
    return new Block(blockToHash.index, '', data, previous.hash, hash, await Chain.signHash(hash, keyPair.privateKey));
}

function voters(participants: ParticipantRegistry): Set<string> {
    return TestHelper.cast<{ voters: Set<string> }>(participants).voters;
}

function createRemote(participants: ParticipantRegistry, name: string): WebrtcMock {
    const remote: WebrtcMock = new WebrtcMock();
    const remotePlayer: WebRtcPlayer = new WebRtcPlayer(name, remote.webrtc);
    players.push(remotePlayer);
    participants.onNewPlayer(remotePlayer);
    return remote;
}

function createNode(): Node {
    const participants: ParticipantRegistry = new ParticipantRegistry(new LocalPlayer('a'), localKeys);
    const room = { notifyMessage: vi.fn() };
    const chain: DistributedBlockChain = new DistributedBlockChain(chainName, routing, TestHelper.cast<BlockRoomInterface>(room), participants);
    const remote: WebrtcMock = createRemote(participants, 'b');

    const remoteParticipant: Participant = participants.get('b') as Participant;
    remoteParticipant.receiveKey(remoteKeyPair.publicKey);

    return {
        chain,
        internals: internalsOf(chain),
        room,
        participants,
        remote,
        local: participants.local,
        remoteParticipant,
    };
}

describe('DistributedBlockChain', () => {
    beforeAll(async () => {
        localKeys = await ParticipantRegistry.createKeys();
        localKeyPair = localKeys.keyPair;
        remoteKeyPair = (await ParticipantRegistry.createKeys()).keyPair;
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

    test('should request the last block once enough participants are ready', () => {
        // Given
        const { chain, internals, participants, remote } = createNode();
        createRemote(participants, 'c');
        voters(participants).add('b');

        // When
        chain.onParticipantReady({ name: 'b', nbParticipants: 4 });
        const notEnoughState: BlockChainState = internals.state;
        chain.onParticipantReady({ name: 'b', nbParticipants: 3 });

        // Then
        expect(notEnoughState).toEqual(BlockChainState.INITIALISING);
        expect(internals.state).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentMessages(remote)).toEqual([{ type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST, payload: null, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName }]);
    });

    test('should answer the last block request', async () => {
        // Given
        const { internals, remote } = createNode();

        // When
        await internals.onGetLastBlockRequest(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_REQUEST, null));
        await internals.onGetLastBlockRequest(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_REQUEST, null, 'unknown'));

        // Then
        expect(sentMessages(remote)[0]).toEqual({
            type: BlockChainMessageType.GET_LAST_BLOCK_RESPONSE,
            payload: internals.blockChain.getLatestBlock(),
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: chainName,
        });
        expect(sentMessages(remote)).toHaveLength(1);
    });

    test('should request the missing blocks of an outdated chain', async () => {
        // Given
        const { internals, remote } = createNode();
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
        expect(sentMessages(remote)[0]).toEqual({
            type: BlockChainMessageType.GET_BLOCKS_REQUEST,
            payload: { from: 1, to: 2 },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: chainName,
        });
    });

    test('should answer the blocks request', async () => {
        // Given
        const { internals, remote } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        internals.blockChain.append(block1);

        // When
        const state: BlockChainState = await internals.onGetBlocksRequest(receivedMessage(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 0, to: 1 }));

        // Then
        expect(state).toEqual(BlockChainState.INITIALISING);
        expect(sentMessages(remote)[0].payload).toEqual([internals.blockChain.getBlock(0), block1]);
    });

    test('should add the received blocks until an invalid one, then stop catching up with the peer', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 1);
        const block2: Block = await createSignedBlock(block1, 'b', remoteKeyPair, 2);
        const invalidBlock: Block = await createSignedBlock(block1, 'b', remoteKeyPair, 3);

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2, invalidBlock, block2]));

        // Then
        expect(state).toEqual(BlockChainState.INITIALISING);
        expect(room.notifyMessage).toHaveBeenCalledTimes(2);
        expect(room.notifyMessage).toHaveBeenNthCalledWith(1, block1);
        expect(room.notifyMessage).toHaveBeenNthCalledWith(2, block2);
        expect(TimedLogger.error).toHaveBeenCalledWith('Block 2 from b refused, stop catching up with it');
        expect(sentTypes(remote)).toEqual([]);
    });

    test('should ask the last block again once all the received blocks are added', async () => {
        // Given
        const { internals, remote } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1]));

        // Then
        expect(state).toEqual(BlockChainState.OUTDATED);
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.GET_LAST_BLOCK_REQUEST]);
    });

    test('should log the errors of the blocks response', async () => {
        // Given
        const { chain } = createNode();

        // When
        chain.handle(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, TestHelper.cast<ReadonlyArray<Block>>(null)));

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ BlockChainMessageType.GET_BLOCKS_RESPONSE } from b`, expect.any(TypeError)));
    });

    test('should ignore approvals involving unknown participants', async () => {
        // Given
        const { internals, room } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'unknown', remoteKeyPair);

        // When
        const unknownAuthor: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));
        const unknownApprover: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block, 'unknown'));
        const unknownDecliner: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_DECLINED](receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));

        // Then
        expect(unknownAuthor).toEqual(BlockChainState.UP_TO_DATE);
        expect(unknownApprover).toEqual(BlockChainState.UP_TO_DATE);
        expect(unknownDecliner).toEqual(BlockChainState.UP_TO_DATE);
        expect(internals.blocksToValidate.hasBlock(block)).toEqual(false);
        expect(room.notifyMessage).not.toHaveBeenCalled();
    });

    test('should approve a valid block of a remote participant', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(state).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentTypes(remote)[0]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledWith(block));
        expect(internals.blockChain.getLatestBlock()).toBe(block);
    });

    test('should hold, and never count, the votes on a block not signed with a known key of its author', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', localKeyPair);

        // When
        const approvedState: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_DECLINED](receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));

        // Then
        expect(approvedState).toEqual(BlockChainState.INITIALISING);
        expect(internals.votesWaitingForKey.get('b')).toHaveLength(2);
        expect(internals.blocksToValidate.hasBlock(block)).toEqual(false);
        expect(sentTypes(remote)).toEqual([]);
        expect(room.notifyMessage).not.toHaveBeenCalled();
    });

    test('should bound the held votes of an author', async () => {
        // Given
        const { internals } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', localKeyPair);
        const votes = Array.from({ length: 40 }, () => receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // When
        for (const vote of votes) {
            await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](vote);
        }

        // Then the oldest votes are dropped
        expect(internals.votesWaitingForKey.get('b')).toEqual(votes.slice(-32));
    });

    test('should register the decline of a block and approve it locally', async () => {
        // Given
        const { internals, remote, remoteParticipant } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_DECLINED](receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));
        await internals.declineBlockFor(block, remoteParticipant);

        // Then
        expect(state).toEqual(BlockChainState.UP_TO_DATE);
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEW_BLOCK_APPROVED]);
        expect(internals.blocksToValidate.hasDeclinedBlock(block, remoteParticipant)).toEqual(true);
    });

    test('should decline a block concurrent to a block with a lower hash', async () => {
        // Given
        const { internals, remote, local, remoteParticipant } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const otherBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 2);
        const lowerBlock: Block = new Block(1, '', block.data, '', '', '');
        internals.blocksToValidate.approveBlock(lowerBlock, local);

        // When
        await internals.declineBlockFor(block, remoteParticipant);
        await internals.approveBlockFor(otherBlock, remoteParticipant);

        // Then
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEW_BLOCK_DECLINED, BlockChainMessageType.NEW_BLOCK_DECLINED]);
    });

    test('should decline a block which can not be added', async () => {
        // Given
        const { internals, remote, local, remoteParticipant } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const invalidBlock: Block = new Block(1, '', block.data, 'wrong', block.hash, block.signature);

        // When
        await internals.approveBlockFor(invalidBlock, remoteParticipant);

        // Then
        expect(sentTypes(remote)[0]).toEqual(BlockChainMessageType.NEW_BLOCK_DECLINED);
        expect(internals.blocksToValidate.hasDeclinedBlock(invalidBlock, local)).toEqual(true);
    });

    test('should not decline an already approved block which can not be added anymore', async () => {
        // Given
        const { internals, remote, remoteParticipant, room } = createNode();
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
        const { internals, remote, remoteParticipant } = createNode();
        const remoteBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const localBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'a', localKeyPair);
        internals.blockChain.append(remoteBlock);
        internals.localBlock = localBlock;

        // When
        await internals.approveBlockFor(localBlock, remoteParticipant);

        // Then the local block is transmitted again after the remote one, and approved by the only voter
        expect(internals.blockChain.getLatestBlock().index).toEqual(2);
        expect(internals.blockChain.getLatestBlock().previousHash).toEqual(remoteBlock.hash);
        expect(internals.blockChain.getLatestBlock().data).toEqual(localBlock.data);
        expect(internals.localBlock).toBeUndefined();
        expect(sentTypes(remote)[0]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
    });

    test('should transmit again the pending local block once another block is approved', async () => {
        // Given
        const { internals, remoteParticipant, room } = createNode();
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

    test('transmitMessage should create, approve and notify a local block', async () => {
        // Given
        const { chain, remote, room } = createNode();

        // When
        await chain.transmitMessage('move', 42);

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledTimes(1));
        expect(room.notifyMessage.mock.calls[0][0].data).toEqual({ from: 'a', type: 'move', payload: 42 });
        expect(sentTypes(remote)[0]).toEqual(BlockChainMessageType.NEW_BLOCK_APPROVED);
    });

    test('should not transmit a local block without data', async () => {
        // Given
        const { internals, remote } = createNode();

        // When
        await internals.transmitLocalBlock();

        // Then
        expect(TimedLogger.trace).toHaveBeenCalledTimes(1);
        expect(sentMessages(remote)).toHaveLength(0);
    });

    test('should delay the blocks when a latency is configured', async () => {
        // Given
        const { internals, remote } = createNode();
        const block: Block = internals.blockChain.getLatestBlock();
        window.history.pushState({}, '', '/?latency=50');
        vi.useFakeTimers();

        // When
        internals.sendBlock(block, BlockChainMessageType.NEW_BLOCK_APPROVED);
        const sentBeforeLatency: number = sentMessages(remote).length;
        vi.advanceTimersByTime(50);
        window.history.pushState({}, '', '/');

        // Then
        expect(sentBeforeLatency).toEqual(0);
        expect(sentMessages(remote)[0]).toEqual({ type: BlockChainMessageType.NEW_BLOCK_APPROVED, payload: block, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName });
    });

    test('should handle the block room messages and catch up when outdated', async () => {
        // Given
        const { chain, internals, remote } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);

        // When
        chain.handle(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, block1));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toEqual([
            BlockChainMessageType.GET_BLOCKS_REQUEST,
            BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
        ]));
        expect(internals.state).toEqual(BlockChainState.OUTDATED);

        // When
        internals.initiate();
        chain.handle(receivedMessage(BlockChainMessageType.GET_LAST_BLOCK_RESPONSE, block1));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toHaveLength(4));
        expect(sentTypes(remote)[3]).toEqual(BlockChainMessageType.GET_BLOCKS_REQUEST);
    });

    test('should dispatch the blocks messages to their handler', async () => {
        // Given
        const { chain, internals, remote } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'unknown', remoteKeyPair);

        // When
        chain.handle(receivedMessage(BlockChainMessageType.NEW_BLOCK_DECLINED, block));
        chain.handle(receivedMessage(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 0, to: 0 }));
        chain.handle(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, []));

        // Then
        await vi.waitFor(() => expect(sentTypes(remote)).toEqual(expect.arrayContaining([
            BlockChainMessageType.GET_BLOCKS_RESPONSE,
            BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
        ])));
        expect(internals.blocksToValidate.hasBlock(block)).toEqual(false);
    });

    test('should log the messages which can not be handled', async () => {
        // Given
        const { chain, internals } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 'hello', { type: 'chat' });

        // When
        chain.handle(receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ BlockChainMessageType.NEW_BLOCK_APPROVED } from b`, expect.any(Error)));
    });

    test('initiate should do nothing without remote participant', () => {
        // Given
        const { internals, participants, remote } = createNode();
        TestHelper.cast<{ participants: Map<string, Participant> }>(participants).participants.delete('b');
        internals.state = BlockChainState.OUTDATED;

        // When
        internals.initiate();

        // Then
        expect(sentMessages(remote)).toHaveLength(0);
    });

    test('clear should reset the block chain', async () => {
        // Given
        const { chain, internals } = createNode();
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        internals.blockChain.append(block);
        internals.state = BlockChainState.UP_TO_DATE;

        // When
        chain.clear();

        // Then
        expect(internals.blockChain.getLatestBlock().index).toEqual(0);
        expect(internals.state).toEqual(BlockChainState.INITIALISING);
        expect(internals.localBlock).toBeUndefined();
    });

    test('should decline a block signed for another chain', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const otherChainBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 1, { chain: BlockChainName.CHAT });

        // When
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, otherChainBlock));

        // Then
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEW_BLOCK_DECLINED]);
        expect(internals.blockChain.getLatestBlock().index).toEqual(0);
        expect(room.notifyMessage).not.toHaveBeenCalled();
    });

    test('should refuse the blocks of a message type carried by another chain', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const chatBlock: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair, 'hello', { type: 'chat' });

        // When / Then
        await expect(internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, chatBlock)))
            .rejects.toThrow(`chat messages do not belong to the ${ chainName } chain`);

        // When
        await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [chatBlock]));

        // Then
        expect(TimedLogger.error).toHaveBeenCalledWith('Block 1 from b refused, stop catching up with it');
        expect(internals.blockChain.getLatestBlock().index).toEqual(0);
        expect(room.notifyMessage).not.toHaveBeenCalled();
        expect(sentTypes(remote)).toEqual([]);
    });

    test('should hold the votes on the blocks of an author whose key is being negotiated', async () => {
        // Given
        const { chain, internals, participants, remote, room } = createNode();
        createRemote(participants, 'c');
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'c', remoteKeyPair);

        // When
        const state: BlockChainState = await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(state).toEqual(BlockChainState.INITIALISING);
        expect(sentTypes(remote)).toEqual([]);

        // When
        (participants.get('c') as Participant).receiveKey(remoteKeyPair.publicKey);
        chain.onParticipantReady({ name: 'c', nbParticipants: 10 });

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block));
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.NEW_BLOCK_APPROVED]);
    });

    test('should drop the held votes of an author who left', async () => {
        // Given
        const { chain, internals, participants } = createNode();
        createRemote(participants, 'c');
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'c', remoteKeyPair);
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));
        expect(internals.votesWaitingForKey.get('c')).toHaveLength(1);

        // When
        chain.onParticipantLeft('c');

        // Then
        expect(internals.votesWaitingForKey.size).toEqual(0);
    });

    test('should commit the pending blocks approved once a voter left', async () => {
        // Given
        const { chain, internals, participants, local, remoteParticipant, room } = createNode();
        createRemote(participants, 'c');
        voters(participants).add('b').add('c');
        const genesis: Block = internals.blockChain.getLatestBlock();
        const block1: Block = await createSignedBlock(genesis, 'b', remoteKeyPair);
        const otherBlock1: Block = await createSignedBlock(genesis, 'b', remoteKeyPair, 2);
        const staleBlock2: Block = await createSignedBlock(otherBlock1, 'b', remoteKeyPair);
        const invalidHashBlock: Block = new Block(5, '', block1.data, 'previous', 'wrong', '');
        await internals.approveBlockFor(block1, remoteParticipant);
        internals.blocksToValidate.approveBlock(staleBlock2, local);
        internals.blocksToValidate.approveBlock(invalidHashBlock, local);
        expect(room.notifyMessage).not.toHaveBeenCalled();

        // When
        voters(participants).delete('c');
        chain.onParticipantLeft('c');

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block1));
        expect(internals.blockChain.getLatestBlock()).toBe(block1);
    });

    test('should skip the caught up blocks already received from another peer', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const block2: Block = await createSignedBlock(block1, 'b', remoteKeyPair);
        internals.blockChain.append(block1);

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2]));

        // Then
        expect(state).toEqual(BlockChainState.OUTDATED);
        expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block2);
        expect(internals.blockChain.getLatestBlock()).toBe(block2);
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.GET_LAST_BLOCK_REQUEST]);
    });

    test('should verify the caught up blocks of the known authors, and trust those of the unknown ones', async () => {
        // Given
        const forged: Node = createNode();
        const pending: Node = createNode();
        const signedBefore: Node = createNode();
        const unknown: Node = createNode();
        createRemote(pending.participants, 'c');
        signedBefore.remoteParticipant.receiveKey(localKeyPair.publicKey);
        const forgedBlock: Block = await createSignedBlock(forged.internals.blockChain.getLatestBlock(), 'b', localKeyPair);
        const pendingBlock: Block = await createSignedBlock(pending.internals.blockChain.getLatestBlock(), 'c', remoteKeyPair);
        const blockOfPreviousKey: Block = await createSignedBlock(signedBefore.internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const unknownAuthorBlock: Block = await createSignedBlock(unknown.internals.blockChain.getLatestBlock(), 'gone', remoteKeyPair);

        // When
        await forged.internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [forgedBlock]));
        await pending.internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [pendingBlock]));
        await signedBefore.internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [blockOfPreviousKey]));
        await unknown.internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [unknownAuthorBlock]));

        // Then
        expect(forged.room.notifyMessage).not.toHaveBeenCalled();
        expect(pending.room.notifyMessage).not.toHaveBeenCalled();
        expect(signedBefore.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(blockOfPreviousKey);
        // An author who left before this participant joined is unknown: its block is trusted on the hash chain
        expect(unknown.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(unknownAuthorBlock);
    });

    test('should skip a caught up block added by an overlapping response while its hash was checked', async () => {
        // Given
        const { internals, remote, room } = createNode();
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const hasValidHash = internals.blockChain.hasValidHash.bind(internals.blockChain);
        vi.spyOn(internals.blockChain, 'hasValidHash').mockImplementationOnce(async (block: Block) => {
            internals.blockChain.append(block1);
            return await hasValidHash(block);
        });

        // When
        const state: BlockChainState = await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1]));

        // Then
        expect(state).toEqual(BlockChainState.OUTDATED);
        expect(room.notifyMessage).not.toHaveBeenCalled();
        expect(sentTypes(remote)).toEqual([BlockChainMessageType.GET_LAST_BLOCK_REQUEST]);
    });

    test('should accept the live blocks signed with a previous key of their author', async () => {
        // Given
        const { internals, participants, room } = createNode();
        const previousKeyPair: CryptoKeyPair = (await ParticipantRegistry.createKeys()).keyPair;
        createRemote(participants, 'c');
        (participants.get('c') as Participant).receiveKey(previousKeyPair.publicKey);
        // Reconnects after a reload: its current key is being negotiated
        createRemote(participants, 'c');
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'c', previousKeyPair);

        // When
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block);
    });

    test('should verify a vote again when the key of its author is received while verifying', async () => {
        // Given
        const { internals, participants, room } = createNode();
        createRemote(participants, 'c');
        const author: Participant = participants.get('c') as Participant;
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'c', remoteKeyPair);
        const verifyMessage = Chain.verifyMessage.bind(Chain);
        vi.spyOn(Chain, 'verifyMessage').mockImplementation(async (signature: string, hash: string, key: CryptoKey) => {
            author.receiveKey(remoteKeyPair.publicKey);
            return await verifyMessage(signature, hash, key);
        });
        author.receiveKey(localKeyPair.publicKey);
        TestHelper.cast<{ hasCurrentKey: boolean }>(author).hasCurrentKey = false;

        // When
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block);
        expect(internals.votesWaitingForKey.size).toEqual(0);
    });

    test('should drop the held votes on the blocks committed meanwhile', async () => {
        // Given
        const { internals, participants, remoteParticipant } = createNode();
        createRemote(participants, 'c');
        const genesis: Block = internals.blockChain.getLatestBlock();
        const committedBlock: Block = await createSignedBlock(genesis, 'b', remoteKeyPair);
        const blockOfC: Block = await createSignedBlock(genesis, 'c', remoteKeyPair, 2);
        const nextBlockOfC: Block = await createSignedBlock(committedBlock, 'c', remoteKeyPair, 3);
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, blockOfC));
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, nextBlockOfC));
        TestHelper.cast<Map<string, unknown[]>>(internals.votesWaitingForKey).set('other', [receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, blockOfC)]);

        // When
        await internals.approveBlockFor(committedBlock, remoteParticipant);

        // Then
        expect(internals.votesWaitingForKey.get('c')).toEqual([receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, nextBlockOfC)]);
        expect(internals.votesWaitingForKey.has('other')).toEqual(false);
    });

    test('should log the failure to commit the pending blocks once a participant left', async () => {
        // Given
        const { chain, internals, local } = createNode();
        internals.blocksToValidate.approveBlock(internals.blockChain.getLatestBlock(), local);
        vi.spyOn(internals.blockChain, 'hasValidHash').mockRejectedValue(new Error('hash failure'));

        // When
        chain.onParticipantLeft('c');

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith('Failed to commit the pending blocks once c left', expect.any(Error)));
    });

    test('should replay the held votes one after the other, in their arrival order', async () => {
        // Given
        const { chain, internals, participants, room } = createNode();
        createRemote(participants, 'c');
        const block1: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'c', remoteKeyPair, 1);
        const block2: Block = await createSignedBlock(block1, 'c', remoteKeyPair, 2);
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block1));
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block2));

        // When
        (participants.get('c') as Participant).receiveKey(remoteKeyPair.publicKey);
        chain.onParticipantReady({ name: 'c', nbParticipants: 10 });

        // Then block 2 is not declined for being handled before block 1 is committed
        await vi.waitFor(() => expect(room.notifyMessage.mock.calls).toEqual([[block1], [block2]]));
    });

    test('should count the approvals already received from a participant once it is a voter', async () => {
        // Given
        const { chain, internals, participants, local, room } = createNode();
        createRemote(participants, 'c');
        voters(participants).add('b');
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        internals.blocksToValidate.approveBlock(block, local);
        internals.blocksToValidate.approveBlock(block, participants.get('c') as Participant);
        expect(internals.blocksToValidate.blockJustApproved(block)).toEqual(false);

        // When b leaves without notice and c is ready
        voters(participants).delete('b');
        voters(participants).add('c');
        chain.onParticipantReady({ name: 'c', nbParticipants: 10 });

        // Then
        await vi.waitFor(() => expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block));
    });

    test('should clean up after a caught up block as after a committed one', async () => {
        // Given
        const { internals, participants, remote } = createNode();
        createRemote(participants, 'c');
        const genesis: Block = internals.blockChain.getLatestBlock();
        const caughtUpBlock: Block = await createSignedBlock(genesis, 'b', remoteKeyPair);
        const localBlock: Block = await createSignedBlock(genesis, 'a', localKeyPair, 2);
        const staleBlockOfC: Block = await createSignedBlock(genesis, 'c', remoteKeyPair, 3);
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, staleBlockOfC));
        internals.localBlock = localBlock;

        // When
        await internals.onGetBlocksResponse(receivedMessage(BlockChainMessageType.GET_BLOCKS_RESPONSE, [caughtUpBlock]));

        // Then the held vote is stale, and the local block is transmitted again after the caught up one
        expect(internals.votesWaitingForKey.has('c')).toEqual(false);
        await vi.waitFor(() => expect(internals.blockChain.getLatestBlock().data).toEqual(localBlock.data));
        expect(internals.blockChain.getLatestBlock().index).toEqual(2);
        expect([...sentTypes(remote)].sort()).toEqual([BlockChainMessageType.GET_LAST_BLOCK_REQUEST, BlockChainMessageType.NEW_BLOCK_APPROVED]);
    });

    test('should verify the live blocks with the newest key of their author first', async () => {
        // Given
        const { internals, remoteParticipant } = createNode();
        remoteParticipant.receiveKey(localKeyPair.publicKey);
        remoteParticipant.receiveKey(remoteKeyPair.publicKey);
        const block: Block = await createSignedBlock(internals.blockChain.getLatestBlock(), 'b', remoteKeyPair);
        const verifyMessageSpy = vi.spyOn(Chain, 'verifyMessage');

        // When
        await internals.messageHandler[BlockChainMessageType.NEW_BLOCK_APPROVED](receivedMessage(BlockChainMessageType.NEW_BLOCK_APPROVED, block));

        // Then
        expect(verifyMessageSpy).toHaveBeenCalledOnce();
    });
});
