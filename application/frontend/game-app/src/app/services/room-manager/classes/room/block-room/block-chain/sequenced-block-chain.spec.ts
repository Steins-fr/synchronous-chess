import { SequencedBlockChain } from './sequenced-block-chain';
import { Block, ChainEntry } from './block';
import { BlockToHash, Chain } from './chain';
import { ParticipantKeys, ParticipantRegistry } from './participant-registry';
import { Participant } from './participant';
import { AntiCheat } from '../anti-cheat/anti-cheat';
import { CheatReason } from '../anti-cheat/cheat-report';
import { BlockChainName } from '../block-chain-name.enum';
import { BlockRoomInterface } from '../block-room.interface';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { Player } from '@app/services/room-manager/classes/player/player';
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
import { afterEach, beforeAll, beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';

const chainName: BlockChainName = BlockChainName.CHESS;
const routing: ReadonlyMap<string, BlockChainName> = new Map([['move', chainName], ['chat', BlockChainName.CHAT]]);

let localKeys: ParticipantKeys;
let remoteKeys: ParticipantKeys;
let otherKeys: ParticipantKeys;

interface ChainInternals {
    blockChain: Chain;
    syncing: boolean;
    awaitingBlocksFrom: Set<string>;
    queuedEntries: ChainEntry[];
    ownPendingEntries: Map<string, ChainEntry>;
    checksWaitingForKey: Map<string, Block[]>;
    queue: Promise<void>;
}

interface Node {
    chain: SequencedBlockChain;
    internals: ChainInternals;
    participants: ParticipantRegistry;
    room: { notifyMessage: ReturnType<typeof vi.fn> };
    report: MockInstance<AntiCheat['report']>;
    players: Record<string, Player>;
}

function createPlayer(name: string): Player {
    return TestHelper.cast<Player>({ name, isLocal: false, sendData: vi.fn() });
}

/** The local participant 'a', with the remote participants 'b' (key known) and 'c' (key being negotiated) */
function createNode(sequencer: string = 'a'): Node {
    const participants: ParticipantRegistry = new ParticipantRegistry(new LocalPlayer('a'), localKeys);
    const players: Record<string, Player> = { b: createPlayer('b'), c: createPlayer('c') };
    participants.onNewPlayer(players['b']);
    participants.onNewPlayer(players['c']);
    (participants.get('b') as Participant).receiveKey(remoteKeys.keyPair.publicKey);
    const antiCheat: AntiCheat = new AntiCheat(participants);
    const report = vi.spyOn(antiCheat, 'report');
    const room = { notifyMessage: vi.fn() };
    const chain: SequencedBlockChain = new SequencedBlockChain(chainName, routing, TestHelper.cast<BlockRoomInterface>(room), participants, antiCheat, sequencer);

    return { chain, internals: TestHelper.cast<ChainInternals>(chain), participants, room, report, players };
}

function sent(player: Player): BlockChainMessage[] {
    return vi.mocked(player.sendData).mock.calls
        .map((call: unknown[]) => call[0] as NetworkMessage)
        .filter((message: NetworkMessage): message is BlockChainMessage => message.origin === MessageOriginType.BLOCK_ROOM_SERVICE);
}

function sentTypes(player: Player): BlockChainMessageType[] {
    return sent(player).map((message: BlockChainMessage) => message.type);
}

function received<K extends BlockChainMessageType>(type: K, payload: BlockChainPayloads[K], from: string = 'b'): ReceivedBlockChainMessage<K> {
    return TestHelper.cast<ReceivedBlockChainMessage<K>>({ type, payload, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName, from });
}

async function createEntry(from: string, keys: ParticipantKeys, payload: unknown = 1, options: { id?: string; type?: string; chain?: BlockChainName } = {}): Promise<ChainEntry> {
    const { id = crypto.randomUUID(), type = 'move', chain = chainName } = options;
    const data: AppMessage = { from, type, payload };
    return { id, data, signature: await Chain.sign(Chain.entryContent(chain, id, data), keys.keyPair.privateKey) };
}

async function createBlock(previous: Block, entry: ChainEntry, sequencer: string, keys: ParticipantKeys): Promise<Block> {
    const blockToHash: BlockToHash = { index: previous.index + 1, previousHash: previous.hash, entry, sequencer };
    const hash: string = await Chain.calculateHash(chainName, blockToHash);
    return new Block(blockToHash.index, previous.hash, entry, sequencer, hash, await Chain.sign(hash, keys.keyPair.privateKey));
}

async function handled(node: Node, message: ReceivedBlockChainMessage): Promise<void> {
    node.chain.handle(message);
    await node.internals.queue;
}

describe('SequencedBlockChain', () => {
    beforeAll(async () => {
        localKeys = await ParticipantRegistry.createKeys();
        remoteKeys = await ParticipantRegistry.createKeys();
        otherKeys = await ParticipantRegistry.createKeys();
    });

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'log').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('as sequencer', () => {
        test('should order, broadcast and deliver its own messages', async () => {
            // Given
            const { chain, internals, room, players } = createNode();

            // When
            await chain.transmitMessage('move', 'e4');

            // Then
            const block: Block = internals.blockChain.getLatestBlock();
            expect(block.index).toEqual(1);
            expect(block.sequencer).toEqual('a');
            expect(block.entry.data).toEqual({ from: 'a', type: 'move', payload: 'e4' });
            expect(room.notifyMessage).toHaveBeenCalledExactlyOnceWith(block.entry.data);
            expect(sent(players['b'])).toEqual([{ type: BlockChainMessageType.NEW_BLOCK, payload: block, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName }]);
            expect(internals.ownPendingEntries.size).toEqual(0);
            expect(await internals.blockChain.hasValidHash(block)).toEqual(true);
        });

        test('should order the entries submitted by the participants', async () => {
            // Given
            const node: Node = createNode();
            const entry: ChainEntry = await createEntry('b', remoteKeys, 'd5');

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry));

            // Then the entry submitted again is ordered once
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(1);
            expect(node.internals.blockChain.getLatestBlock().entry).toEqual(entry);
            expect(node.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(entry.data);
            expect(node.report).not.toHaveBeenCalled();
        });

        test('should refuse the entries of another participant or of another chain', async () => {
            // Given
            const node: Node = createNode();
            const entryOfC: ChainEntry = await createEntry('c', otherKeys);
            const chatEntry: ChainEntry = await createEntry('b', remoteKeys, 'hello', { type: 'chat' });

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entryOfC));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, chatEntry));

            // Then
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
            expect(TimedLogger.warn).toHaveBeenCalledTimes(2);
        });

        test('should delay the broadcast when a latency is configured', async () => {
            // Given
            const { chain, players } = createNode();
            window.history.pushState({}, '', '/?latency=50');
            vi.useFakeTimers();

            // When
            await chain.transmitMessage('move', 'e4');
            const sentBeforeLatency: number = sent(players['b']).length;
            vi.advanceTimersByTime(50);
            window.history.pushState({}, '', '/');

            // Then
            expect(sentBeforeLatency).toEqual(0);
            expect(sentTypes(players['b'])).toEqual([BlockChainMessageType.NEW_BLOCK]);
        });
    });

    describe('as participant', () => {
        test('should submit its messages to the sequencer, and deliver them once ordered', async () => {
            // Given
            const node: Node = createNode('b');

            // When
            await node.chain.transmitMessage('move', 'e4');

            // Then
            const [submission] = sent(node.players['b']);
            expect(submission.type).toEqual(BlockChainMessageType.SUBMIT_ENTRY);
            expect(node.room.notifyMessage).not.toHaveBeenCalled();
            expect(node.internals.ownPendingEntries.size).toEqual(1);

            // When
            const entry: ChainEntry = TestHelper.cast<ChainEntry>(submission.payload);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, await createBlock(node.internals.blockChain.getLatestBlock(), entry, 'b', remoteKeys)));

            // Then
            expect(node.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(entry.data);
            expect(node.internals.ownPendingEntries.size).toEqual(0);
            expect(node.report).not.toHaveBeenCalled();
        });

        test('should not order the submitted entries', async () => {
            // Given
            const node: Node = createNode('b');

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', remoteKeys)));

            // Then
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
            expect(TimedLogger.warn).toHaveBeenCalledOnce();
        });

        test('should only add the blocks of its sequencer', async () => {
            // Given
            const node: Node = createNode('b');
            const genesis: Block = node.internals.blockChain.getLatestBlock();
            const block: Block = await createBlock(genesis, await createEntry('b', remoteKeys), 'b', remoteKeys);
            const blockOfC: Block = await createBlock(genesis, await createEntry('c', otherKeys), 'c', otherKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block, 'c'));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, blockOfC));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block);
            expect(node.room.notifyMessage).toHaveBeenCalledOnce();
        });

        test('should catch up once with the sequencer when blocks are missing', async () => {
            // Given
            const node: Node = createNode('b');
            const block1: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys, 1), 'b', remoteKeys);
            const block2: Block = await createBlock(block1, await createEntry('b', remoteKeys, 2), 'b', remoteKeys);
            const block3: Block = await createBlock(block2, await createEntry('b', remoteKeys, 3), 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block2));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block3));

            // Then
            expect(sent(node.players['b'])).toEqual([{ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 }, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName }]);

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2, block3]));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block3);
            expect(node.room.notifyMessage.mock.calls).toEqual([[block1.entry.data], [block2.entry.data], [block3.entry.data]]);
        });

        test('should report the invalid and the conflicting blocks of the sequencer', async () => {
            // Given
            const node: Node = createNode('b');
            const genesis: Block = node.internals.blockChain.getLatestBlock();
            const block1: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 1), 'b', remoteKeys);
            const conflictingBlock1: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 2), 'b', remoteKeys);
            const tamperedBlock2: Block = { ...await createBlock(block1, await createEntry('b', remoteKeys, 3), 'b', remoteKeys), sequencer: 'b', hash: 'tampered' };
            const forkedBlock2: Block = await createBlock(conflictingBlock1, await createEntry('b', remoteKeys, 4), 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, conflictingBlock1));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, tamperedBlock2));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forkedBlock2));

            // Then
            expect(node.report.mock.calls.map(([report]) => [report.index, report.reason])).toEqual([
                [1, CheatReason.CONFLICTING_BLOCK],
                [2, CheatReason.INVALID_BLOCK],
                [2, CheatReason.CONFLICTING_BLOCK],
            ]);
            expect(node.internals.blockChain.getLatestBlock()).toBe(block1);
        });

        test('should add the blocks of its sequencer not signed by it, and report them', async () => {
            // Given
            const node: Node = createNode('b');
            const block: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys), 'b', otherKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block);
            expect(node.report).toHaveBeenCalledExactlyOnceWith({
                chain: chainName,
                index: 1,
                hash: block.hash,
                author: 'b',
                sequencer: 'b',
                reason: CheatReason.FORGED_SEQUENCING,
            });
        });

        test('should catch up with its sequencer once ready, and submit its pending entries again', async () => {
            // Given
            const node: Node = createNode('c');
            await node.chain.transmitMessage('move', 'e4');
            const [submission] = sent(node.players['c']);

            // When
            node.chain.onParticipantReady('b');
            node.chain.onParticipantReady('c');
            await node.internals.queue;

            // Then
            expect(sent(node.players['c'])).toEqual([submission, expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST }), submission]);
            expect(sent(node.players['b'])).toEqual([]);
        });
    });

    describe('cheat detection', () => {
        test('should leave out of the application the replayed entries and the entries of another chain', async () => {
            // Given
            const node: Node = createNode('b');
            const entry: ChainEntry = await createEntry('b', remoteKeys);
            const chatEntry: ChainEntry = await createEntry('b', remoteKeys, 'hello', { type: 'chat', chain: BlockChainName.CHAT });
            const block1: Block = await createBlock(node.internals.blockChain.getLatestBlock(), entry, 'b', remoteKeys);
            const replayedBlock: Block = await createBlock(block1, entry, 'b', remoteKeys);
            const chatBlock: Block = await createBlock(replayedBlock, chatEntry, 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, replayedBlock));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, chatBlock));

            // Then the chain follows its sequencer
            expect(node.internals.blockChain.getLatestBlock()).toBe(chatBlock);
            expect(node.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(entry.data);
            expect(node.report.mock.calls.map(([report]) => [report.index, report.reason])).toEqual([
                [2, CheatReason.REPLAYED_ENTRY],
                [3, CheatReason.WRONG_CHAIN],
                // The signature binds the entry to its chain
                [3, CheatReason.FORGED_AUTHOR],
            ]);
        });

        test('should report the entries not signed by their author', async () => {
            // Given
            const node: Node = createNode('b');
            const forgedEntry: ChainEntry = await createEntry('b', otherKeys);
            const entryOfUnknownAuthor: ChainEntry = await createEntry('gone', otherKeys);
            const forgedBlock: Block = await createBlock(node.internals.blockChain.getLatestBlock(), forgedEntry, 'b', remoteKeys);
            const blockOfUnknownAuthor: Block = await createBlock(forgedBlock, entryOfUnknownAuthor, 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forgedBlock));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, blockOfUnknownAuthor));

            // Then the block of an author who left before is not checked
            expect(node.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ index: 1, reason: CheatReason.FORGED_AUTHOR }));
            expect(node.room.notifyMessage).toHaveBeenCalledTimes(2);
        });

        test('should check the entries of an author once its key is received', async () => {
            // Given
            const node: Node = createNode('b');
            const validBlock: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('c', otherKeys, 1), 'b', remoteKeys);
            const forgedBlock: Block = await createBlock(validBlock, await createEntry('c', remoteKeys, 2), 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, validBlock));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forgedBlock));
            expect(node.internals.checksWaitingForKey.get('c')).toEqual([validBlock, forgedBlock]);

            // When
            (node.participants.get('c') as Participant).receiveKey(otherKeys.keyPair.publicKey);
            node.chain.onParticipantReady('c');
            await node.internals.queue;

            // Then
            expect(node.internals.checksWaitingForKey.size).toEqual(0);
            expect(node.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ index: 2, reason: CheatReason.FORGED_AUTHOR }));
        });

        test('should bound the checks waiting for the key of an author, and drop them when it leaves', async () => {
            // Given
            const node: Node = createNode('b');
            const blocks: Block[] = [];
            let previous: Block = node.internals.blockChain.getLatestBlock();
            for (let index = 0; index < 34; index++) {
                previous = await createBlock(previous, await createEntry('c', otherKeys, index), 'b', remoteKeys);
                blocks.push(previous);
            }

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, []));
            node.internals.awaitingBlocksFrom.add('b');
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, blocks));

            // Then
            expect(node.internals.checksWaitingForKey.get('c')).toEqual(blocks.slice(-32));

            // When
            node.chain.onParticipantLeft('c');

            // Then
            expect(node.internals.checksWaitingForKey.size).toEqual(0);
        });

        test('should check an entry again when the key of its author is received while checking', async () => {
            // Given
            const node: Node = createNode('b');
            const author: Participant = node.participants.get('c') as Participant;
            const block: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('c', otherKeys), 'b', remoteKeys);
            // A key of a previous connection, which does not sign the entry
            TestHelper.cast<{ keys: CryptoKey[] }>(author).keys.push(localKeys.keyPair.publicKey);
            const verify = Chain.verify.bind(Chain);
            vi.spyOn(Chain, 'verify').mockImplementation(async (signature: string, content: string, key: CryptoKey) => {
                // While checking the entry with the key of the previous connection
                if (key === localKeys.keyPair.publicKey && !author.isReady()) {
                    author.receiveKey(otherKeys.keyPair.publicKey);
                }
                return await verify(signature, content, key);
            });

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));

            // Then
            expect(node.report).not.toHaveBeenCalled();
            expect(node.internals.checksWaitingForKey.size).toEqual(0);
        });
    });

    describe('catch up', () => {
        test('should answer the blocks requests, a page at a time', async () => {
            // Given
            const node: Node = createNode();
            for (let index = 0; index < 52; index++) {
                await node.chain.transmitMessage('move', index);
            }
            vi.mocked(node.players['b'].sendData).mockClear();

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 2 }));

            // Then
            const [response] = sent(node.players['b']);
            expect(response.type).toEqual(BlockChainMessageType.GET_BLOCKS_RESPONSE);
            expect(TestHelper.cast<Block[]>(response.payload).map((block: Block) => block.index)).toEqual(Array.from({ length: 50 }, (_, index) => index + 2));
        });

        test('should ask for the next page of a full response', async () => {
            // Given
            const node: Node = createNode('b');
            const blocks: Block[] = [];
            let previous: Block = node.internals.blockChain.getLatestBlock();
            for (let index = 0; index < 50; index++) {
                previous = await createBlock(previous, await createEntry('b', remoteKeys, index), 'b', remoteKeys);
                blocks.push(previous);
            }
            node.internals.awaitingBlocksFrom.add('b');

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, blocks));

            // Then
            expect(sent(node.players['b'])).toEqual([expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 51 } })]);
            expect(node.internals.awaitingBlocksFrom.has('b')).toEqual(true);
        });

        test('should ignore the responses it did not ask for, and stop at a refused block', async () => {
            // Given
            const node: Node = createNode('b');
            const block1: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys, 1), 'b', remoteKeys);
            const tamperedBlock2: Block = { ...await createBlock(block1, await createEntry('b', remoteKeys, 2), 'b', remoteKeys), hash: 'tampered' };

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1]));
            node.internals.awaitingBlocksFrom.add('b');
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, tamperedBlock2]));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block1);
            expect(TimedLogger.error).toHaveBeenCalledWith('Block 2 from b refused, stop catching up with it');
            expect(node.internals.awaitingBlocksFrom.size).toEqual(0);
        });

        test('should refuse the blocks of a sequencer forged by another participant', async () => {
            // Given
            const node: Node = createNode('b');
            const forgedBlock: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys), 'b', otherKeys);
            const blockOfUnknownSequencer: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys), 'gone', otherKeys);
            node.internals.awaitingBlocksFrom.add('c');

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [forgedBlock], 'c'));
            node.internals.awaitingBlocksFrom.add('c');
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [blockOfUnknownSequencer], 'c'));

            // Then the block of a sequencer whose keys are unknown is trusted on the hash chain
            expect(node.internals.blockChain.getLatestBlock()).toBe(blockOfUnknownSequencer);
            expect(node.report).not.toHaveBeenCalled();
        });
    });

    describe('sequencer change', () => {
        test('should submit its pending entries to a new sequencer, and catch up with it', async () => {
            // Given
            const node: Node = createNode('c');
            await node.chain.transmitMessage('move', 'e4');
            const [submission] = sent(node.players['c']);

            // When
            node.chain.changeSequencer('b');
            await node.internals.queue;

            // Then
            expect(sent(node.players['b'])).toEqual([submission, expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST })]);
        });

        test('should collect the blocks of the participants before ordering, as the new sequencer', async () => {
            // Given
            const node: Node = createNode('b');
            const blockOfFormerSequencer: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys, 1), 'b', remoteKeys);
            await node.chain.transmitMessage('move', 'own');

            // When
            node.chain.changeSequencer('a');
            await node.internals.queue;
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', remoteKeys, 'submitted')));
            await node.chain.transmitMessage('move', 'while syncing');

            // Then
            expect(node.internals.syncing).toEqual(true);
            expect(sentTypes(node.players['b'])).toContain(BlockChainMessageType.GET_BLOCKS_REQUEST);
            expect(sentTypes(node.players['c'])).toContain(BlockChainMessageType.GET_BLOCKS_REQUEST);
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);

            // When b answers with the block the former sequencer sent to it only, and c leaves
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [blockOfFormerSequencer]));
            node.chain.onParticipantLeft('c');
            await node.internals.queue;

            // Then nothing is rolled back, the entries are ordered after the collected block
            expect(node.internals.syncing).toEqual(false);
            expect(node.room.notifyMessage.mock.calls.map(([data]) => data.payload)).toEqual([1, 'own', 'while syncing', 'submitted']);
            expect(node.internals.blockChain.getLatestBlock().sequencer).toEqual('a');
        });

        test('should order at once when it is alone', async () => {
            // Given
            const node: Node = createNode('b');
            node.participants.onPlayerLeft(node.players['b']);
            node.participants.onPlayerLeft(node.players['c']);

            // When
            node.chain.changeSequencer('a');
            await node.internals.queue;
            await node.chain.transmitMessage('move', 'e4');

            // Then
            expect(node.internals.syncing).toEqual(false);
            expect(node.room.notifyMessage).toHaveBeenCalledOnce();
        });
    });

    test('should log the messages which can not be handled', async () => {
        // Given
        const node: Node = createNode('b');

        // When
        node.chain.handle(received(BlockChainMessageType.NEW_BLOCK, TestHelper.cast<Block>(null)));

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith(`Failed to handle ${ BlockChainMessageType.NEW_BLOCK } from b`, expect.any(TypeError)));
    });

    test('clear should reset the chain', async () => {
        // Given
        const node: Node = createNode();
        await node.chain.transmitMessage('move', 'e4');
        node.internals.syncing = true;
        node.internals.awaitingBlocksFrom.add('b');
        node.internals.queuedEntries.push(await createEntry('b', remoteKeys));
        node.internals.ownPendingEntries.set('id', await createEntry('a', localKeys));
        node.internals.checksWaitingForKey.set('c', []);

        // When
        node.chain.clear();

        // Then
        expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
        expect(node.internals.syncing).toEqual(false);
        expect(node.internals.awaitingBlocksFrom.size).toEqual(0);
        expect(node.internals.queuedEntries).toEqual([]);
        expect(node.internals.ownPendingEntries.size).toEqual(0);
        expect(node.internals.checksWaitingForKey.size).toEqual(0);
    });
});
