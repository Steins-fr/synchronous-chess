import { DefaultUrlSerializer, UrlTree } from '@angular/router';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import {
    BlockChainMessage,
    BlockChainMessageType,
    ReceivedBlockChainMessage
} from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { AntiCheat } from '../anti-cheat/anti-cheat';
import { CheatReason } from '../anti-cheat/cheat-report';
import { BlockChainName } from '../block-chain-name.enum';
import { BlockRoomInterface } from '../block-room.interface';
import { Block, ChainEntry } from './block';
import { BlockToHash, Chain } from './chain';
import { Participant } from './participant';
import { ParticipantRegistry } from './participant-registry';

type MessageHandlers = {
    [K in BlockChainMessageType]: (message: ReceivedBlockChainMessage<K>) => Promise<void>;
};

/**
 * A block chain whose blocks are ordered by a single participant, the sequencer: the blocks can not fork.
 * The participants sign their entries and submit them to the sequencer, which appends them and broadcasts the blocks.
 * Each participant checks the blocks it adds and reports the cheats to the anti-cheat.
 *
 * When the sequencer leaves, the room names another one, which first collects the blocks of all the participants:
 * a block the former sequencer sent to some of them only is kept, none is rolled back.
 */
export class SequencedBlockChain {
    /** For a response to fit in a data channel message */
    private static readonly MAX_BLOCKS_PER_RESPONSE: number = 50;
    /** Bounds the memory taken by the blocks of an author whose key never comes */
    private static readonly MAX_CHECKS_PER_AUTHOR: number = 32;

    private readonly blockChain: Chain;
    private sequencer: string;
    /** As a new sequencer, collecting the blocks of the participants before ordering new ones */
    private syncing: boolean = false;
    /** The participants asked for blocks, until their last response */
    private readonly awaitingBlocksFrom: Set<string> = new Set();
    /** The entries submitted while syncing, ordered once synced */
    private readonly queuedEntries: ChainEntry[] = [];
    /** The entries of the local participant not in the chain yet, submitted again to a new sequencer */
    private readonly ownPendingEntries: Map<string, ChainEntry> = new Map();
    /** The blocks whose author signature is checked once the key of their author is received */
    private readonly checksWaitingForKey: Map<string, Block[]> = new Map();
    /** The chain changes one message at a time, so that the blocks are added in order */
    private queue: Promise<void> = Promise.resolve();

    private readonly messageHandler: MessageHandlers = {
        [BlockChainMessageType.SUBMIT_ENTRY]: (message) => this.onSubmitEntry(message),
        [BlockChainMessageType.NEW_BLOCK]: (message) => this.onNewBlock(message),
        [BlockChainMessageType.GET_BLOCKS_REQUEST]: (message) => this.onGetBlocksRequest(message),
        [BlockChainMessageType.GET_BLOCKS_RESPONSE]: (message) => this.onGetBlocksResponse(message),
    };

    /**
     * @param name the chain name, which is part of the hash of its blocks
     * @param routing the chain of each message type, the blocks of the types of other chains are reported
     * @param sequencer the participant ordering the blocks
     */
    public constructor(
        public readonly name: BlockChainName,
        private readonly routing: ReadonlyMap<string, BlockChainName>,
        private readonly blockRoomService: BlockRoomInterface,
        private readonly participants: ParticipantRegistry,
        private readonly antiCheat: AntiCheat,
        sequencer: string,
    ) {
        this.blockChain = new Chain(name);
        this.sequencer = sequencer;
    }

    private get isSequencer(): boolean {
        return this.sequencer === this.participants.local.name;
    }

    private serially(task: () => Promise<void>): Promise<void> {
        const result: Promise<void> = this.queue.then(task);
        this.queue = result.catch(() => undefined);
        return result;
    }

    public handle<K extends BlockChainMessageType>(message: ReceivedBlockChainMessage<K>): void {
        const handler: MessageHandlers[K] = this.messageHandler[message.type];
        void logHandlingFailure(message, this.serially(() => handler(message)));
    }

    public async transmitMessage(type: string, payload: unknown): Promise<void> {
        const id: string = crypto.randomUUID();
        const data: AppMessage = { from: this.participants.local.name, type, payload };
        const signature: string = await Chain.sign(Chain.entryContent(this.name, id, data), this.participants.keys.keyPair.privateKey);
        const entry: ChainEntry = { id, data, signature };

        this.ownPendingEntries.set(id, entry);
        await this.serially(() => this.submit(entry));
    }

    private async submit(entry: ChainEntry): Promise<void> {
        if (!this.isSequencer) {
            this.submitTo(this.sequencer, entry);
        } else if (this.syncing) {
            this.queuedEntries.push(entry);
        } else {
            await this.sequence(entry);
        }
    }

    private async onSubmitEntry(message: ReceivedBlockChainMessage<BlockChainMessageType.SUBMIT_ENTRY>): Promise<void> {
        const entry: ChainEntry = message.payload;

        // A participant only submits its own entries, its connection proves who it is
        if (!this.isSequencer || entry.data.from !== message.from || !this.ownsType(entry.data.type)) {
            TimedLogger.warn(`Entry of ${ message.from } refused by the ${ this.name } chain`, entry);
            return;
        }

        if (this.syncing) {
            this.queuedEntries.push(entry);
        } else {
            await this.sequence(entry);
        }
    }

    private async sequence(entry: ChainEntry): Promise<void> {
        // An entry submitted again to a new sequencer may already be in the chain
        if (this.blockChain.hasEntry(entry.id)) {
            return;
        }

        const latestBlock: Block = this.blockChain.getLatestBlock();
        const blockToHash: BlockToHash = {
            index: latestBlock.index + 1,
            previousHash: latestBlock.hash,
            entry,
            sequencer: this.participants.local.name,
        };
        const hash: string = await Chain.calculateHash(this.name, blockToHash);
        const block: Block = new Block(
            blockToHash.index,
            blockToHash.previousHash,
            entry,
            blockToHash.sequencer,
            hash,
            await Chain.sign(hash, this.participants.keys.keyPair.privateKey),
        );

        this.broadcastBlock(block);
        await this.addBlock(block);
    }

    private broadcastBlock(block: Block): void {
        const message: BlockChainMessage = { type: BlockChainMessageType.NEW_BLOCK, payload: block, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: this.name };
        const url: UrlTree = new DefaultUrlSerializer().parse(`/${ window.location.search }`);
        const latency: string | null = url.queryParamMap.get('latency');

        // Debug: simulates a slow network with ?latency=<ms>
        if (latency) {
            setTimeout(() => this.participants.broadcast(message), Number.parseInt(latency, 10));
        } else {
            this.participants.broadcast(message);
        }
    }

    private async onNewBlock(message: ReceivedBlockChainMessage<BlockChainMessageType.NEW_BLOCK>): Promise<void> {
        const block: Block = message.payload;
        const latestBlock: Block = this.blockChain.getLatestBlock();

        if (message.from !== this.sequencer || block.sequencer !== this.sequencer || this.blockChain.contains(block)) {
            return;
        }

        if (block.index > latestBlock.index + 1) {
            // Some blocks were missed, the catch up brings this one too
            this.requestBlocks(this.sequencer);
        } else if (!await this.blockChain.hasValidHash(block)) {
            this.report(block, CheatReason.INVALID_BLOCK);
        } else if (!this.blockChain.canAppend(block)) {
            this.report(block, CheatReason.CONFLICTING_BLOCK);
        } else {
            await this.acceptBlock(block, true);
        }
    }

    /**
     * @param fromSequencer whether the block comes from the connection of its sequencer, which orders the chain
     * @returns whether the block is added
     */
    private async acceptBlock(block: Block, fromSequencer: boolean): Promise<boolean> {
        if (!await this.isSignedBySequencer(block)) {
            // The sequencer orders the chain, its blocks are added anyway; another participant can not forge them
            if (!fromSequencer) {
                return false;
            }

            this.report(block, CheatReason.FORGED_SEQUENCING);
        }

        await this.addBlock(block);
        return true;
    }

    /** Signed, or by a sequencer whose keys are not known: the block is trusted on the hash chain */
    private async isSignedBySequencer(block: Block): Promise<boolean> {
        const sequencer: Participant | undefined = this.participants.author(block.sequencer);
        return !sequencer?.knownKeys.length || await this.isSignedWithOneOf(block.sequencerSignature, block.hash, sequencer.knownKeys);
    }

    /** The block must follow the latest one */
    private async addBlock(block: Block): Promise<void> {
        const { entry } = block;
        // Checked before appending the block, which adds its entry to the chain
        const isReplayed: boolean = this.blockChain.hasEntry(entry.id);
        const isOwned: boolean = this.ownsType(entry.data.type);

        this.blockChain.append(block);
        this.ownPendingEntries.delete(entry.id);

        if (isReplayed) {
            this.report(block, CheatReason.REPLAYED_ENTRY);
        }

        if (!isOwned) {
            this.report(block, CheatReason.WRONG_CHAIN);
        }

        // Every participant finds these cheats alike, so they all leave the block out of the application
        if (!isReplayed && isOwned) {
            this.blockRoomService.notifyMessage(entry.data);
        }

        await this.checkAuthor(block);
    }

    private async checkAuthor(block: Block): Promise<void> {
        const author: Participant | undefined = this.participants.author(block.entry.data.from);

        // An author who left before this participant joined is unknown
        if (!author) {
            return;
        }

        // A copy: the key of the author may be received while verifying
        const keys: ReadonlyArray<CryptoKey> = [...author.knownKeys];
        const content: string = Chain.entryContent(this.name, block.entry.id, block.entry.data);

        if (await this.isSignedWithOneOf(block.entry.signature, content, keys)) {
            return;
        }

        if (author.knownKeys.length > keys.length) {
            await this.checkAuthor(block);
        } else if (author.isReady()) {
            this.report(block, CheatReason.FORGED_AUTHOR);
        } else {
            const blocks: Block[] = [...this.checksWaitingForKey.get(author.name) ?? [], block];
            this.checksWaitingForKey.set(author.name, blocks.slice(-SequencedBlockChain.MAX_CHECKS_PER_AUTHOR));
        }
    }

    /** From the newest key, which signs the live blocks */
    private async isSignedWithOneOf(signature: string, content: string, keys: ReadonlyArray<CryptoKey>): Promise<boolean> {
        for (const key of [...keys].reverse()) {
            if (await Chain.verify(signature, content, key)) {
                return true;
            }
        }

        return false;
    }

    private requestBlocks(participantName: string): void {
        if (this.awaitingBlocksFrom.has(participantName)) {
            return;
        }

        this.awaitingBlocksFrom.add(participantName);
        this.participants.send(participantName, {
            type: BlockChainMessageType.GET_BLOCKS_REQUEST,
            payload: { from: this.blockChain.getLatestBlock().index + 1 },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        });
    }

    private async onGetBlocksRequest(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_BLOCKS_REQUEST>): Promise<void> {
        const blocks: ReadonlyArray<Block> = this.blockChain.blocksFrom(message.payload.from, SequencedBlockChain.MAX_BLOCKS_PER_RESPONSE);
        this.participants.send(message.from, { type: BlockChainMessageType.GET_BLOCKS_RESPONSE, payload: blocks, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: this.name });
    }

    private async onGetBlocksResponse(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_BLOCKS_RESPONSE>): Promise<void> {
        // A participant can not push blocks without being asked
        if (!this.awaitingBlocksFrom.has(message.from)) {
            return;
        }

        this.awaitingBlocksFrom.delete(message.from);
        const fromSequencer: boolean = message.from === this.sequencer;

        for (const block of message.payload) {
            // Several participants answer a new sequencer with the same blocks
            if (this.blockChain.contains(block)) {
                continue;
            }

            if (!await this.blockChain.hasValidHash(block) || !this.blockChain.canAppend(block) || !await this.acceptBlock(block, fromSequencer)) {
                // Asking again would bring the same refused block
                TimedLogger.error(`Block ${ block.index } from ${ message.from } refused, stop catching up with it`);
                await this.finishSyncIfDone();
                return;
            }
        }

        if (message.payload.length === SequencedBlockChain.MAX_BLOCKS_PER_RESPONSE) {
            this.requestBlocks(message.from);
        }

        await this.finishSyncIfDone();
    }

    /** The key of a participant has just been received */
    public onParticipantReady(name: string): void {
        const blocks: ReadonlyArray<Block> = this.checksWaitingForKey.get(name) ?? [];
        this.checksWaitingForKey.delete(name);

        void this.serially(async () => {
            for (const block of blocks) {
                await this.checkAuthor(block);
            }

            if (name === this.sequencer && !this.isSequencer) {
                // Catches up with the sequencer, and submits the entries it may not have received
                this.requestBlocks(name);
                this.submitPendingEntries();
            }
        });
    }

    public onParticipantLeft(name: string): void {
        this.checksWaitingForKey.delete(name);

        void this.serially(async () => {
            this.awaitingBlocksFrom.delete(name);
            await this.finishSyncIfDone();
        });
    }

    /** The former sequencer left: a new one takes over */
    public changeSequencer(name: string): void {
        void this.serially(async () => {
            this.sequencer = name;

            if (!this.isSequencer) {
                // The entries the former sequencer did not order, and the blocks it sent to some participants only
                this.submitPendingEntries();
                this.requestBlocks(name);
                return;
            }

            // Collects the blocks the former sequencer sent to some participants only, before ordering new ones
            this.syncing = true;
            for (const participant of this.participants.values()) {
                if (!participant.isLocal) {
                    this.requestBlocks(participant.name);
                }
            }

            await this.finishSyncIfDone();
        });
    }

    private submitPendingEntries(): void {
        this.ownPendingEntries.forEach((entry: ChainEntry) => this.submitTo(this.sequencer, entry));
    }

    private submitTo(sequencer: string, entry: ChainEntry): void {
        this.participants.send(sequencer, { type: BlockChainMessageType.SUBMIT_ENTRY, payload: entry, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: this.name });
    }

    private async finishSyncIfDone(): Promise<void> {
        if (!this.syncing || this.awaitingBlocksFrom.size > 0) {
            return;
        }

        this.syncing = false;

        for (const entry of [...this.ownPendingEntries.values(), ...this.queuedEntries.splice(0)]) {
            await this.sequence(entry);
        }
    }

    private ownsType(type: string): boolean {
        return this.routing.get(type) === this.name;
    }

    private report(block: Block, reason: CheatReason): void {
        this.antiCheat.report({
            chain: this.name,
            index: block.index,
            hash: block.hash,
            author: block.entry.data.from,
            sequencer: block.sequencer,
            reason,
        });
    }

    public clear(): void {
        this.blockChain.reset();
        this.awaitingBlocksFrom.clear();
        this.queuedEntries.splice(0);
        this.ownPendingEntries.clear();
        this.checksWaitingForKey.clear();
        this.syncing = false;
    }
}
