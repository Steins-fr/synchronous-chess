import { SequencedBlockChain } from './sequenced-block-chain';
import { Block, ChainEntry, ChainHead } from './block';
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
const delay: number = SequencedBlockChain.CENSORSHIP_DELAY_MS;
const handoverDelay: number = SequencedBlockChain.HANDOVER_DELAY_MS;

let localKeys: ParticipantKeys;
let remoteKeys: ParticipantKeys;
let otherKeys: ParticipantKeys;

interface WatchedEntry {
    entry: ChainEntry;
    since?: number;
    latestIndex: number;
}

interface ChainInternals {
    blockChain: Chain;
    syncing: boolean;
    awaitingBlocksFrom: Set<string>;
    handoverRequests: Map<string, number>;
    queuedEntries: ChainEntry[];
    entriesWaitingForKey: Map<string, ChainEntry[]>;
    ownPendingEntries: Map<string, ChainEntry>;
    watchedEntries: Map<string, WatchedEntry>;
    leftOut: Set<number>;
    deliveredIndex: number;
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
    vi.mocked(players['b'].sendData).mockClear();
    vi.mocked(players['c'].sendData).mockClear();
    const antiCheat: AntiCheat = new AntiCheat(participants);
    const report = vi.spyOn(antiCheat, 'report');
    const room = { notifyMessage: vi.fn() };
    const chain: SequencedBlockChain = new SequencedBlockChain(chainName, routing, TestHelper.cast<BlockRoomInterface>(room), participants, antiCheat, sequencer);

    return { chain, internals: TestHelper.cast<ChainInternals>(chain), participants, room, report, players };
}

/** The key of 'c' is received */
function readyC(node: Node): void {
    (node.participants.get('c') as Participant).receiveKey(otherKeys.keyPair.publicKey);
}

function delivered(node: Node): AppMessage[] {
    return node.room.notifyMessage.mock.calls.map((call: unknown[]) => TestHelper.cast<Block>(call[1]).entry.data);
}

function sent(player: Player): BlockChainMessage[] {
    return vi.mocked(player.sendData).mock.calls
        .map((call: unknown[]) => call[0] as NetworkMessage)
        .filter((message: NetworkMessage): message is BlockChainMessage => message.origin === MessageOriginType.BLOCK_ROOM_SERVICE);
}

function sentTypes(player: Player): BlockChainMessageType[] {
    return sent(player).map((message: BlockChainMessage) => message.type);
}

function reasons(node: Node): Array<[number | undefined, CheatReason]> {
    return node.report.mock.calls.map(([report]) => [report.index, report.reason]);
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

async function createBlocks(node: Node, count: number, author: string, keys: ParticipantKeys): Promise<Block[]> {
    const blocks: Block[] = [];
    let previous: Block = node.internals.blockChain.getLatestBlock();
    for (let index = 0; index < count; index++) {
        previous = await createBlock(previous, await createEntry(author, keys, index), 'b', remoteKeys);
        blocks.push(previous);
    }
    return blocks;
}

function headOf(block: Block): ChainHead {
    const { index, hash, sequencer, sequencerSignature } = block;
    return { index, hash, sequencer, sequencerSignature };
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
            const node: Node = createNode();

            // When
            await node.chain.transmitMessage('move', 'e4');

            // Then
            const block: Block = node.internals.blockChain.getLatestBlock();
            expect(block.index).toEqual(1);
            expect(block.sequencer).toEqual('a');
            expect(block.entry.data).toEqual({ from: 'a', type: 'move', payload: 'e4' });
            expect(node.room.notifyMessage).toHaveBeenCalledExactlyOnceWith(chainName, block);
            expect(sent(node.players['b'])).toEqual([{ type: BlockChainMessageType.NEW_BLOCK, payload: block, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName }]);
            expect(node.internals.ownPendingEntries.size).toEqual(0);
            expect(await node.internals.blockChain.hasValidHash(block)).toEqual(true);
        });

        test('should order the entries submitted by the participants, once', async () => {
            // Given
            const node: Node = createNode();
            const entry: ChainEntry = await createEntry('b', remoteKeys, 'd5');

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry));

            // Then
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(1);
            expect(node.internals.blockChain.getLatestBlock().entry).toEqual(entry);
            expect(delivered(node)).toEqual([entry.data]);
            expect(node.report).not.toHaveBeenCalled();
        });

        test('should refuse the entries of another participant, of another chain, or not signed by their author', async () => {
            // Given
            const node: Node = createNode();

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('c', otherKeys)));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', remoteKeys, 'hello', { type: 'chat' })));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', otherKeys)));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('z', otherKeys), 'z'));

            // Then the sequencer can not be blamed for a forged entry
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
            expect(TimedLogger.warn).toHaveBeenCalledTimes(4);
        });

        test('should order the entries of an author once its key is received, at most 32 of them', async () => {
            // Given
            const node: Node = createNode();
            const entries: ChainEntry[] = [];
            for (let index = 0; index < 33; index++) {
                entries.push(await createEntry('c', otherKeys, index));
                await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entries[index], 'c'));
            }
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);

            // When
            (node.participants.get('c') as Participant).receiveKey(otherKeys.keyPair.publicKey);
            node.chain.onParticipantReady('c');
            await node.internals.queue;

            // Then
            expect(delivered(node)).toEqual(entries.slice(-32).map((entry: ChainEntry) => entry.data));
            expect(node.internals.entriesWaitingForKey.size).toEqual(0);
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
        test('should submit its messages to everyone, and deliver them once ordered', async () => {
            // Given
            const node: Node = createNode('b');

            // When
            await node.chain.transmitMessage('move', 'e4');

            // Then the sequencer orders it, the other participant watches it
            const [submission] = sent(node.players['b']);
            expect(submission.type).toEqual(BlockChainMessageType.SUBMIT_ENTRY);
            expect(sent(node.players['c'])).toEqual([submission]);
            expect(delivered(node)).toEqual([]);
            expect(node.internals.ownPendingEntries.size).toEqual(1);
            expect(node.internals.watchedEntries.size).toEqual(1);

            // When
            const entry: ChainEntry = TestHelper.cast<ChainEntry>(submission.payload);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, await createBlock(node.internals.blockChain.getLatestBlock(), entry, 'b', remoteKeys)));

            // Then
            expect(delivered(node)).toEqual([entry.data]);
            expect(node.internals.ownPendingEntries.size).toEqual(0);
            expect(node.internals.watchedEntries.size).toEqual(0);
            expect(node.report).not.toHaveBeenCalled();
        });

        test('should watch the entries submitted to the sequencer, without ordering them', async () => {
            // Given
            const node: Node = createNode('b');
            readyC(node);
            const entry: ChainEntry = await createEntry('c', otherKeys);

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry, 'c'));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry, 'c'));

            // Then
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
            expect([...node.internals.watchedEntries.keys()]).toEqual([entry.id]);
        });

        test('should only watch the entries signed by their author, as the sequencer only orders them', async () => {
            // Given
            const node: Node = createNode('b');
            const entry: ChainEntry = await createEntry('c', otherKeys);

            // When
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', otherKeys)));
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, entry, 'c'));

            // Then the entry of c waits for its key
            expect(node.internals.watchedEntries.size).toEqual(0);

            // When
            readyC(node);
            node.chain.onParticipantReady('c');
            await node.internals.queue;

            // Then
            expect([...node.internals.watchedEntries.keys()]).toEqual([entry.id]);
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
            const [block1, block2, block3] = await createBlocks(node, 3, 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block2));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block3));

            // Then
            expect(sent(node.players['b'])).toEqual([{ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 }, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: chainName }]);

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2, block3]));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block3);
            expect(delivered(node)).toEqual([block1.entry.data, block2.entry.data, block3.entry.data]);
        });

        test('should report the invalid and the conflicting blocks of the sequencer', async () => {
            // Given
            const node: Node = createNode('b');
            const genesis: Block = node.internals.blockChain.getLatestBlock();
            const block1: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 1), 'b', remoteKeys);
            const conflictingBlock1: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 2), 'b', remoteKeys);
            const tamperedBlock2: Block = { ...await createBlock(block1, await createEntry('b', remoteKeys, 3), 'b', remoteKeys), hash: 'tampered' };
            const forkedBlock2: Block = await createBlock(conflictingBlock1, await createEntry('b', remoteKeys, 4), 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, conflictingBlock1));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, tamperedBlock2));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forkedBlock2));

            // Then
            expect(reasons(node)).toEqual([
                [1, CheatReason.CONFLICTING_BLOCK],
                [2, CheatReason.INVALID_BLOCK],
                [2, CheatReason.CONFLICTING_BLOCK],
            ]);
            expect(node.internals.blockChain.getLatestBlock()).toBe(block1);
        });

        test('should add the blocks of its sequencer not signed by it, and leave them out of the application', async () => {
            // Given
            const node: Node = createNode('b');
            const block: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('b', remoteKeys), 'b', otherKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));

            // Then
            expect(node.internals.blockChain.getLatestBlock()).toBe(block);
            expect(node.room.notifyMessage).not.toHaveBeenCalled();
            expect(node.report).toHaveBeenCalledExactlyOnceWith({
                chain: chainName,
                subject: block.hash,
                index: 1,
                author: 'b',
                sequencer: 'b',
                reason: CheatReason.FORGED_SEQUENCING,
            });
        });

        test('should catch up with its sequencer once ready, submit its pending entries again and show its chain', async () => {
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
            expect(sent(node.players['b'])).toEqual([submission, submission]);
        });
    });

    describe('delivery', () => {
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
            expect(delivered(node)).toEqual([entry.data]);
            expect(reasons(node)).toEqual([[2, CheatReason.REPLAYED_ENTRY], [3, CheatReason.WRONG_CHAIN]]);
        });

        test('should leave out the entries not signed by their author, and trust the unknown authors', async () => {
            // Given
            const node: Node = createNode('b');
            const forgedEntry: ChainEntry = await createEntry('b', otherKeys);
            const entryOfUnknownAuthor: ChainEntry = await createEntry('gone', otherKeys);
            const forgedBlock: Block = await createBlock(node.internals.blockChain.getLatestBlock(), forgedEntry, 'b', remoteKeys);
            const blockOfUnknownAuthor: Block = await createBlock(forgedBlock, entryOfUnknownAuthor, 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forgedBlock));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, blockOfUnknownAuthor));

            // Then
            expect(reasons(node)).toEqual([[1, CheatReason.FORGED_AUTHOR]]);
            expect(delivered(node)).toEqual([entryOfUnknownAuthor.data]);
        });

        test('should deliver in order, waiting for the key of an author', async () => {
            // Given
            const node: Node = createNode('b');
            const blockOfC: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('c', otherKeys, 1), 'b', remoteKeys);
            const forgedBlockOfC: Block = await createBlock(blockOfC, await createEntry('c', remoteKeys, 2), 'b', remoteKeys);
            const blockOfB: Block = await createBlock(forgedBlockOfC, await createEntry('b', remoteKeys, 3), 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, blockOfC));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, forgedBlockOfC));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, blockOfB));
            expect(delivered(node)).toEqual([]);

            // When
            (node.participants.get('c') as Participant).receiveKey(otherKeys.keyPair.publicKey);
            node.chain.onParticipantReady('c');
            await node.internals.queue;

            // Then
            expect(delivered(node)).toEqual([blockOfC.entry.data, blockOfB.entry.data]);
            expect(reasons(node)).toEqual([[2, CheatReason.FORGED_AUTHOR]]);
        });

        test('should deliver the entries of an author who left before sending its key', async () => {
            // Given
            const node: Node = createNode('b');
            const author: Participant = node.participants.get('c') as Participant;
            // A key of a previous connection, which does not sign the entry
            TestHelper.cast<{ keys: CryptoKey[] }>(author).keys.push(localKeys.keyPair.publicKey);
            const block: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('c', otherKeys), 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block));

            // When
            node.participants.onPlayerLeft(node.players['c']);
            node.chain.onParticipantLeft('c');
            await node.internals.queue;

            // Then
            expect(delivered(node)).toEqual([block.entry.data]);
            expect(node.report).not.toHaveBeenCalled();
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
            expect(delivered(node)).toEqual([block.entry.data]);
            expect(node.report).not.toHaveBeenCalled();
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
            const blocks: Block[] = await createBlocks(node, 50, 'b', remoteKeys);
            node.internals.awaitingBlocksFrom.add('b');

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, blocks));

            // Then
            expect(sent(node.players['b'])).toEqual([expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 51 } })]);
            expect(node.internals.awaitingBlocksFrom.has('b')).toEqual(true);
        });

        test('should skip the blocks it has already, as when several participants answer a new sequencer', async () => {
            // Given a block received, then a response bringing it again with the next one
            const node: Node = createNode('b');
            const [block1, block2] = await createBlocks(node, 2, 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));
            node.internals.awaitingBlocksFrom.add('b');

            // When
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [block1, block2]));

            // Then the block is added and delivered once
            expect(node.internals.blockChain.getLatestBlock()).toBe(block2);
            expect(delivered(node)).toEqual([block1.entry.data, block2.entry.data]);
            expect(TimedLogger.error).not.toHaveBeenCalled();
            expect(node.report).not.toHaveBeenCalled();
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

    describe('comparison of the chains', () => {
        test('should show its latest block to everyone at each tick, once it has one', async () => {
            // Given
            const node: Node = createNode();
            node.chain.tick(0);
            expect(sent(node.players['b'])).toEqual([]);
            await node.chain.transmitMessage('move', 'e4');
            vi.mocked(node.players['b'].sendData).mockClear();

            // When
            node.chain.tick(0);

            // Then
            expect(sent(node.players['b'])).toEqual([{
                type: BlockChainMessageType.CHAIN_HEAD,
                payload: headOf(node.internals.blockChain.getLatestBlock()),
                origin: MessageOriginType.BLOCK_ROOM_SERVICE,
                chain: chainName,
            }]);
        });

        test('should catch up with a participant whose chain goes further', async () => {
            // Given
            const node: Node = createNode('b');
            const [block1] = await createBlocks(node, 1, 'b', remoteKeys);

            // When
            await handled(node, received(BlockChainMessageType.CHAIN_HEAD, headOf(block1), 'c'));

            // Then
            expect(sent(node.players['c'])).toEqual([expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST, payload: { from: 1 } })]);
        });

        test('should report a sequencer which signed different blocks for the same index', async () => {
            // Given
            const node: Node = createNode('b');
            const genesis: Block = node.internals.blockChain.getLatestBlock();
            const [block1] = await createBlocks(node, 1, 'b', remoteKeys);
            const otherBlock1: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 'other'), 'b', remoteKeys);
            const unsignedBlock1: Block = { ...otherBlock1, sequencerSignature: block1.sequencerSignature };
            const blockOfOtherSequencer: Block = await createBlock(genesis, await createEntry('b', remoteKeys, 'other'), 'c', otherKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));

            // When
            await handled(node, received(BlockChainMessageType.CHAIN_HEAD, headOf(block1), 'c'));
            await handled(node, received(BlockChainMessageType.CHAIN_HEAD, headOf(blockOfOtherSequencer), 'c'));
            await handled(node, received(BlockChainMessageType.CHAIN_HEAD, headOf(unsignedBlock1), 'c'));
            await handled(node, received(BlockChainMessageType.CHAIN_HEAD, headOf(otherBlock1), 'c'));

            // Then only the proof signed by the sequencer is reported, the other differences are logged
            expect(reasons(node)).toEqual([[1, CheatReason.CONFLICTING_BLOCK]]);
            expect(TimedLogger.warn).toHaveBeenCalledTimes(2);
        });
    });

    describe('watch of the sequencer', () => {
        test('should report an entry the sequencer does not order while it orders other ones', async () => {
            // Given
            const node: Node = createNode('b');
            readyC(node);
            const ignoredEntry: ChainEntry = await createEntry('c', otherKeys);
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, ignoredEntry, 'c'));
            node.chain.tick(1000);

            // When the sequencer orders nothing
            node.chain.tick(1000 + delay);

            // Then
            expect(node.report).not.toHaveBeenCalled();

            // When the sequencer orders another entry, for not long enough, then long enough
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, (await createBlocks(node, 1, 'b', remoteKeys))[0]));
            node.chain.tick(1000 + delay - 1);
            node.chain.tick(1000 + delay);
            node.chain.tick(1000 + delay + 1);

            // Then
            expect(node.report).toHaveBeenCalledExactlyOnceWith({
                chain: chainName,
                subject: ignoredEntry.id,
                author: 'c',
                sequencer: 'b',
                reason: CheatReason.CENSORED_ENTRY,
            });
            expect(node.internals.watchedEntries.size).toEqual(0);
        });

        test('should give a new sequencer the time to order the watched entries', async () => {
            // Given
            const node: Node = createNode('b');
            readyC(node);
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('c', otherKeys), 'c'));
            node.chain.tick(0);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, (await createBlocks(node, 1, 'b', remoteKeys))[0]));

            // When
            node.chain.changeSequencer('c');
            await node.internals.queue;
            node.chain.tick(delay);

            // Then
            expect(node.report).not.toHaveBeenCalled();
            expect([...node.internals.watchedEntries.values()][0]).toEqual(expect.objectContaining({ since: delay, latestIndex: 1 }));
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
            expect(sent(node.players['b'])).toEqual([submission, submission, expect.objectContaining({ type: BlockChainMessageType.GET_BLOCKS_REQUEST })]);
        });

        test('should collect the blocks of the participants before ordering, as the new sequencer', async () => {
            // Given a distrusted sequencer c, which sent a block to b only
            const node: Node = createNode('c');
            readyC(node);
            const blockOfFormerSequencer: Block = await createBlock(node.internals.blockChain.getLatestBlock(), await createEntry('c', otherKeys, 'former'), 'c', otherKeys);
            await node.chain.transmitMessage('move', 'own');
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', remoteKeys, 'watched')));

            // When
            node.chain.changeSequencer('a');
            await node.internals.queue;
            await handled(node, received(BlockChainMessageType.SUBMIT_ENTRY, await createEntry('b', remoteKeys, 'submitted')));
            await node.chain.transmitMessage('move', 'while syncing');

            // Then the former sequencer is not asked
            expect(node.internals.syncing).toEqual(true);
            expect(sent(node.players['b']).filter((message: BlockChainMessage) => message.type === BlockChainMessageType.GET_BLOCKS_REQUEST))
                .toEqual([expect.objectContaining({ payload: { from: 1, handover: true } })]);
            expect(sentTypes(node.players['c'])).not.toContain(BlockChainMessageType.GET_BLOCKS_REQUEST);
            expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);

            // When b answers with the block the former sequencer sent to it only
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_RESPONSE, [blockOfFormerSequencer]));

            // Then nothing is rolled back, the entries are ordered after the collected block, the watched ones included
            expect(node.internals.syncing).toEqual(false);
            expect(delivered(node).map((data: AppMessage) => data.payload)).toEqual(['former', 'own', 'while syncing', 'watched', 'submitted']);
            expect(node.internals.blockChain.getLatestBlock().sequencer).toEqual('a');
            expect(node.internals.watchedEntries.size).toEqual(0);
        });

        test('should stop waiting for the participants not following it, as the new sequencer', async () => {
            // Given
            const node: Node = createNode('b');
            readyC(node);
            node.chain.changeSequencer('a');
            await node.internals.queue;
            await node.chain.transmitMessage('move', 'e4');
            node.chain.tick(1000);

            // When
            node.chain.tick(1000 + handoverDelay - 1);
            await node.internals.queue;

            // Then
            expect(node.internals.syncing).toEqual(true);

            // When
            node.chain.tick(1000 + handoverDelay);
            await node.internals.queue;

            // Then
            expect(node.internals.syncing).toEqual(false);
            expect(node.internals.awaitingBlocksFrom.size).toEqual(0);
            expect(delivered(node)).toEqual([{ from: 'a', type: 'move', payload: 'e4' }]);
            expect(TimedLogger.warn).toHaveBeenCalledWith('Participants not following a on the chess chain, it stops waiting for their blocks', ['c']);
        });

        test('should not stop a collection of the blocks already finished', async () => {
            // Given
            const node: Node = createNode('c');
            node.chain.changeSequencer('a');
            await node.internals.queue;
            node.chain.tick(0);
            expect(node.internals.awaitingBlocksFrom).toEqual(new Set(['b']));

            // When b answers before the collection is stopped
            node.chain.handle(received(BlockChainMessageType.GET_BLOCKS_RESPONSE, []));
            node.chain.tick(handoverDelay);
            await node.internals.queue;

            // Then
            expect(node.internals.syncing).toEqual(false);
            expect(TimedLogger.warn).not.toHaveBeenCalled();
        });

        test('should give its blocks to a new sequencer once it follows it', async () => {
            // Given
            const node: Node = createNode('b');
            readyC(node);
            const [block1, block2] = await createBlocks(node, 2, 'b', remoteKeys);
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block1));

            // When c takes over before this participant, and the former sequencer sends a block meanwhile
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 1, handover: true }, 'c'));
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, block2));

            // Then
            expect(sent(node.players['c'])).toEqual([]);

            // When
            node.chain.changeSequencer('c');
            await node.internals.queue;
            await handled(node, received(BlockChainMessageType.NEW_BLOCK, (await createBlocks(node, 1, 'b', remoteKeys))[0]));
            await handled(node, received(BlockChainMessageType.GET_BLOCKS_REQUEST, { from: 2, handover: true }, 'c'));

            // Then c gets every block of the former sequencer this participant added, which adds no other one
            expect(sent(node.players['c']).filter((message: BlockChainMessage) => message.type === BlockChainMessageType.GET_BLOCKS_RESPONSE).map((message: BlockChainMessage) => message.payload))
                .toEqual([[block1, block2], [block2]]);
            expect(node.internals.blockChain.getLatestBlock()).toBe(block2);
            expect(node.internals.handoverRequests.size).toEqual(0);
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
        node.internals.handoverRequests.set('c', 1);
        node.internals.queuedEntries.push(await createEntry('b', remoteKeys));
        node.internals.entriesWaitingForKey.set('c', []);
        node.internals.ownPendingEntries.set('id', await createEntry('a', localKeys));
        node.internals.watchedEntries.set('id', { entry: await createEntry('a', localKeys), latestIndex: 0 });
        node.internals.leftOut.add(1);

        // When
        node.chain.clear();

        // Then
        expect(node.internals.blockChain.getLatestBlock().index).toEqual(0);
        expect(node.internals.syncing).toEqual(false);
        expect(node.internals.awaitingBlocksFrom.size).toEqual(0);
        expect(node.internals.handoverRequests.size).toEqual(0);
        expect(node.internals.queuedEntries).toEqual([]);
        expect(node.internals.entriesWaitingForKey.size).toEqual(0);
        expect(node.internals.ownPendingEntries.size).toEqual(0);
        expect(node.internals.watchedEntries.size).toEqual(0);
        expect(node.internals.leftOut.size).toEqual(0);
        expect(node.internals.deliveredIndex).toEqual(0);
    });
});
