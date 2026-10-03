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
import { Block, ChainEntry, ChainHead } from './block';
import { BlockToHash, Chain } from './chain';
import { Participant } from './participant';
import { ParticipantRegistry } from './participant-registry';

type MessageHandlers = {
    [K in BlockChainMessageType]: (message: ReceivedBlockChainMessage<K>) => Promise<void> | void;
};

enum Signature {
    SIGNED = 'signed',
    FORGED = 'forged',
    /** The keys of the signer are not known */
    UNKNOWN = 'unknown',
    /** The key of the signer is being negotiated */
    PENDING = 'pending',
}

/** An entry submitted to the sequencer, which a participant watches until it is ordered */
interface WatchedEntry {
    entry: ChainEntry;
    /** When the watch started, set by the next tick */
    since?: number;
    /** The latest index when the watch started: the sequencer ordering other entries since ignores this one */
    latestIndex: number;
}

/**
 * A block chain whose blocks are ordered by a single participant, the sequencer: the blocks can not fork.
 * The participants sign their entries and submit them to the sequencer, which appends them and broadcasts the blocks.
 *
 * The other participants watch the sequencer:
 * - they check the blocks they add, and leave the cheated ones out of the application;
 * - they watch the entries submitted are ordered;
 * - they compare their latest blocks, to detect a sequencer sending different blocks to the participants.
 * They report the cheats to the anti-cheat.
 *
 * When the sequencer leaves or is distrusted, the room names another one, which first collects the blocks of all the
 * participants: a block the former sequencer sent to some of them only is kept, none is rolled back.
 */
export class SequencedBlockChain {
    /** For a response to fit in a data channel message */
    private static readonly MAX_BLOCKS_PER_RESPONSE: number = 50;
    /** Bounds the memory taken by the entries of an author whose key never comes */
    private static readonly MAX_ENTRIES_WAITING_FOR_KEY: number = 32;
    /** An entry not ordered within this delay, while the sequencer orders other ones, is reported */
    public static readonly CENSORSHIP_DELAY_MS: number = 10_000;
    /** A new sequencer stops waiting for the blocks of a participant not following it within this delay */
    public static readonly HANDOVER_DELAY_MS: number = 10_000;

    private readonly blockChain: Chain;
    private sequencer: string;
    /** As a new sequencer, collecting the blocks of the participants before ordering new ones */
    private syncing: boolean = false;
    /** When the collection started, set by the next tick */
    private syncingSince?: number;
    /** The new sequencers collecting the blocks, answered once this participant follows them: the index they collect from */
    private readonly handoverRequests: Map<string, number> = new Map();
    /** The participants asked for blocks, until their last response */
    private readonly awaitingBlocksFrom: Set<string> = new Set();
    /** The entries submitted while syncing, ordered once synced */
    private readonly queuedEntries: ChainEntry[] = [];
    /** The entries checked once the key of their author is received */
    private readonly entriesWaitingForKey: Map<string, ChainEntry[]> = new Map();
    /** The entries of the local participant not in the chain yet, submitted again to a new sequencer */
    private readonly ownPendingEntries: Map<string, ChainEntry> = new Map();
    /** The entries submitted to the sequencer, watched until they are ordered */
    private readonly watchedEntries: Map<string, WatchedEntry> = new Map();
    /** The indexes of the blocks left out of the application, as all the participants find them cheated alike */
    private readonly leftOut: Set<number> = new Set();
    /** The index of the latest block delivered to the application, or left out of it */
    private deliveredIndex: number = 0;
    /** The chain changes one message at a time, so that the blocks are added in order */
    private queue: Promise<void> = Promise.resolve();

    private readonly messageHandler: MessageHandlers = {
        [BlockChainMessageType.SUBMIT_ENTRY]: (message) => this.onSubmitEntry(message),
        [BlockChainMessageType.NEW_BLOCK]: (message) => this.onNewBlock(message),
        [BlockChainMessageType.GET_BLOCKS_REQUEST]: (message) => this.onGetBlocksRequest(message),
        [BlockChainMessageType.GET_BLOCKS_RESPONSE]: (message) => this.onGetBlocksResponse(message),
        [BlockChainMessageType.CHAIN_HEAD]: (message) => this.onChainHead(message),
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

    private serially(task: () => Promise<void> | void): Promise<void> {
        const result: Promise<void> = this.queue.then(task);
        this.queue = result.catch(() => undefined);
        return result;
    }

    public handle<K extends BlockChainMessageType>(message: ReceivedBlockChainMessage<K>): void {
        const handler: MessageHandlers[K] = this.messageHandler[message.type];
        void logHandlingFailure(message, this.serially(() => handler(message)));
    }

    // Submission

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
            this.watch(entry);
            this.broadcastEntry(entry);
        } else if (this.syncing) {
            this.queuedEntries.push(entry);
        } else {
            await this.sequence(entry);
        }
    }

    /** To the sequencer which orders it, and to the others which watch it is ordered */
    private broadcastEntry(entry: ChainEntry): void {
        this.participants.broadcast({ type: BlockChainMessageType.SUBMIT_ENTRY, payload: entry, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: this.name });
    }

    private async onSubmitEntry(message: ReceivedBlockChainMessage<BlockChainMessageType.SUBMIT_ENTRY>): Promise<void> {
        const entry: ChainEntry = message.payload;

        // A participant only submits its own entries, its connection proves who it is
        if (entry.data.from !== message.from || !this.ownsType(entry.data.type)) {
            TimedLogger.warn(`Entry of ${ message.from } refused by the ${ this.name } chain`, entry);
            return;
        }

        await this.receiveEntry(entry);
    }

    /**
     * The entry of another participant, once its signature is checked: the sequencer is not blamed for a forged entry it
     * orders, and the others only watch the entries an honest sequencer orders
     */
    private async receiveEntry(entry: ChainEntry): Promise<void> {
        const author: string = entry.data.from;
        const signature: Signature = await this.signatureOf(entry.signature, this.entryContent(entry), this.participants.get(author));

        if (signature === Signature.PENDING) {
            const entries: ChainEntry[] = [...this.entriesWaitingForKey.get(author) ?? [], entry];
            this.entriesWaitingForKey.set(author, entries.slice(-SequencedBlockChain.MAX_ENTRIES_WAITING_FOR_KEY));
        } else if (signature !== Signature.SIGNED) {
            TimedLogger.warn(`Entry of ${ author } not signed by it, refused by the ${ this.name } chain`, entry);
        } else if (!this.isSequencer) {
            this.watch(entry);
        } else if (this.syncing) {
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
        await this.addBlock(block, false);
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

    // Reception

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
        // Unknown keys: the block is trusted on the hash chain
        const isForged: boolean = await this.sequencingOf(block) === Signature.FORGED;

        // The sequencer orders the chain, its blocks are added anyway; another participant can not forge them
        if (isForged && !fromSequencer) {
            return false;
        }

        await this.addBlock(block, isForged);
        return true;
    }

    private async sequencingOf(head: ChainHead): Promise<Signature> {
        return await this.signatureOf(head.sequencerSignature, head.hash, this.participants.author(head.sequencer));
    }

    /** The block must follow the latest one */
    private async addBlock(block: Block, isForgedSequencing: boolean): Promise<void> {
        const { entry } = block;
        // Checked before appending the block, which adds its entry to the chain
        const isReplayed: boolean = this.blockChain.hasEntry(entry.id);
        const isOwned: boolean = this.ownsType(entry.data.type);

        this.blockChain.append(block);
        this.ownPendingEntries.delete(entry.id);
        this.watchedEntries.delete(entry.id);

        const cheats: ReadonlyArray<CheatReason> = [
            ...isForgedSequencing ? [CheatReason.FORGED_SEQUENCING] : [],
            ...isReplayed ? [CheatReason.REPLAYED_ENTRY] : [],
            ...isOwned ? [] : [CheatReason.WRONG_CHAIN],
        ];

        if (cheats.length > 0) {
            cheats.forEach((reason: CheatReason) => this.report(block, reason));
            this.leftOut.add(block.index);
        }

        await this.deliver();
    }

    /**
     * Delivers the blocks to the application in their order, once their author signature is checked:
     * every participant leaves the same cheated blocks out of the application, so that their states stay the same.
     */
    private async deliver(): Promise<void> {
        const latestIndex: number = this.blockChain.getLatestBlock().index;

        while (this.deliveredIndex < latestIndex) {
            const block: Block = this.blockChain.getBlock(this.deliveredIndex + 1);

            if (!this.leftOut.has(block.index)) {
                // eslint-disable-next-line no-await-in-loop -- the blocks are delivered in their order, up to the first one waiting for a key
                const signature: Signature = await this.signatureOf(block.entry.signature, this.entryContent(block.entry), this.participants.author(block.entry.data.from));

                if (signature === Signature.PENDING) {
                    // Waits for the key of the author, the next blocks with it
                    return;
                }

                if (signature === Signature.FORGED) {
                    this.report(block, CheatReason.FORGED_AUTHOR);
                } else {
                    // An author who left before this participant joined is unknown: its entry is trusted
                    this.blockRoomService.notifyMessage(this.name, block);
                }
            }

            this.deliveredIndex = block.index;
        }
    }

    private entryContent(entry: ChainEntry): string {
        return Chain.entryContent(this.name, entry.id, entry.data);
    }

    private async signatureOf(signature: string, content: string, signer: Participant | undefined): Promise<Signature> {
        if (!signer) {
            return Signature.UNKNOWN;
        }

        // A copy: the key of the signer may be received while verifying
        const keys: ReadonlyArray<CryptoKey> = [...signer.knownKeys];

        // From the newest key, which signs the live entries and blocks
        for (const key of [...keys].reverse()) {
            // eslint-disable-next-line no-await-in-loop -- from the newest key, up to the first one verifying the signature
            if (await Chain.verify(signature, content, key)) {
                return Signature.SIGNED;
            }
        }

        if (signer.knownKeys.length > keys.length) {
            return await this.signatureOf(signature, content, signer);
        }

        if (signer.isReady()) {
            return Signature.FORGED;
        }

        // A participant who left will not send its key anymore
        return this.participants.get(signer.name) === signer ? Signature.PENDING : Signature.UNKNOWN;
    }

    // Catch up

    private requestBlocks(participantName: string, handover?: boolean): void {
        if (this.awaitingBlocksFrom.has(participantName)) {
            return;
        }

        this.awaitingBlocksFrom.add(participantName);
        this.participants.send(participantName, {
            type: BlockChainMessageType.GET_BLOCKS_REQUEST,
            payload: { from: this.blockChain.getLatestBlock().index + 1, handover },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        });
    }

    private onGetBlocksRequest(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_BLOCKS_REQUEST>): void {
        const { from, handover } = message.payload;

        // Answered once following the new sequencer: the blocks the former one sends meanwhile are kept, they reach it
        if (handover && message.from !== this.sequencer) {
            this.handoverRequests.set(message.from, from);
            return;
        }

        this.sendBlocks(message.from, from);
    }

    private sendBlocks(participantName: string, from: number): void {
        const blocks: ReadonlyArray<Block> = this.blockChain.blocksFrom(from, SequencedBlockChain.MAX_BLOCKS_PER_RESPONSE);
        this.participants.send(participantName, { type: BlockChainMessageType.GET_BLOCKS_RESPONSE, payload: blocks, origin: MessageOriginType.BLOCK_ROOM_SERVICE, chain: this.name });
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

            // eslint-disable-next-line no-await-in-loop -- each block follows the previous one, up to the first refused
            if (!await this.blockChain.hasValidHash(block) || !this.blockChain.canAppend(block) || !await this.acceptBlock(block, fromSequencer)) {
                // Asking again would bring the same refused block
                TimedLogger.error(`Block ${ block.index } from ${ message.from } refused, stop catching up with it`);
                // eslint-disable-next-line no-await-in-loop -- once, the loop stops here
                await this.finishSyncIfDone();
                return;
            }
        }

        if (message.payload.length === SequencedBlockChain.MAX_BLOCKS_PER_RESPONSE) {
            this.requestBlocks(message.from);
        }

        await this.finishSyncIfDone();
    }

    // Comparison of the chains

    private sendHead(participantName?: string): void {
        const latestBlock: Block = this.blockChain.getLatestBlock();

        if (latestBlock.index === 0) {
            return;
        }

        const { index, hash, sequencer, sequencerSignature } = latestBlock;
        const message: BlockChainMessage = {
            type: BlockChainMessageType.CHAIN_HEAD,
            payload: { index, hash, sequencer, sequencerSignature },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        };

        if (participantName) {
            this.participants.send(participantName, message);
        } else {
            this.participants.broadcast(message);
        }
    }

    private async onChainHead(message: ReceivedBlockChainMessage<BlockChainMessageType.CHAIN_HEAD>): Promise<void> {
        const head: ChainHead = message.payload;

        if (head.index > this.blockChain.getLatestBlock().index) {
            // Blocks the sequencer did not send to this participant, the catch up checks they are signed by their sequencer
            this.requestBlocks(message.from);
            return;
        }

        const block: Block = this.blockChain.getBlock(head.index);

        if (block.hash === head.hash) {
            return;
        }

        // Two blocks at the same index, both signed by their sequencer: it sent different blocks to the participants
        if (head.sequencer === block.sequencer && await this.sequencingOf(head) === Signature.SIGNED) {
            this.report(block, CheatReason.CONFLICTING_BLOCK);
        } else {
            TimedLogger.warn(`The ${ this.name } chain of ${ message.from } differs at block ${ head.index }`, head);
        }
    }

    // Watch of the sequencer

    private watch(entry: ChainEntry): void {
        if (!this.watchedEntries.has(entry.id) && !this.blockChain.hasEntry(entry.id)) {
            this.watchedEntries.set(entry.id, { entry, latestIndex: this.blockChain.getLatestBlock().index });
        }
    }

    /**
     * Called regularly: shows the chain to the others, reports the entries the sequencer does not order, and stops a
     * collection of the blocks waiting for participants which do not follow this new sequencer
     */
    public tick(now: number): void {
        this.sendHead();

        if (this.syncing) {
            this.syncingSince ??= now;

            if (now - this.syncingSince >= SequencedBlockChain.HANDOVER_DELAY_MS) {
                void this.serially(() => this.stopSyncing());
            }
        }

        // The entries watched before taking over are ordered once synced
        if (this.isSequencer) {
            return;
        }

        const latestIndex: number = this.blockChain.getLatestBlock().index;

        for (const watched of this.watchedEntries.values()) {
            watched.since ??= now;

            if (latestIndex > watched.latestIndex && now - watched.since >= SequencedBlockChain.CENSORSHIP_DELAY_MS) {
                this.watchedEntries.delete(watched.entry.id);
                this.antiCheat.report({
                    chain: this.name,
                    subject: watched.entry.id,
                    author: watched.entry.data.from,
                    sequencer: this.sequencer,
                    reason: CheatReason.CENSORED_ENTRY,
                });
            }
        }
    }

    // Participants

    /** The key of a participant has just been received */
    public onParticipantReady(name: string): void {
        void this.serially(async () => {
            const entries: ReadonlyArray<ChainEntry> = this.entriesWaitingForKey.get(name) ?? [];
            this.entriesWaitingForKey.delete(name);

            for (const entry of entries) {
                // eslint-disable-next-line no-await-in-loop -- the entries are sequenced in their order
                await this.receiveEntry(entry);
            }

            await this.deliver();
            // Shows its chain to the new participant, which compares it with the one of the sequencer
            this.sendHead(name);

            if (name === this.sequencer && !this.isSequencer) {
                // Catches up with the sequencer, and submits the entries it may not have received
                this.requestBlocks(name);
                this.submitPendingEntries();
            }
        });
    }

    public onParticipantLeft(name: string): void {
        void this.serially(async () => {
            this.awaitingBlocksFrom.delete(name);
            this.entriesWaitingForKey.delete(name);
            this.handoverRequests.delete(name);
            await this.finishSyncIfDone();
            // The author may be forgotten, its blocks are then trusted
            await this.deliver();
        });
    }

    /** The former sequencer left, or is distrusted: a new one takes over */
    public changeSequencer(name: string): void {
        void this.serially(async () => {
            const former: string = this.sequencer;
            this.sequencer = name;

            // The new sequencer gets as much time as the former one to order the watched entries
            this.watchedEntries.forEach((watched: WatchedEntry) => {
                watched.since = undefined;
                watched.latestIndex = this.blockChain.getLatestBlock().index;
            });

            // The blocks of the former sequencer are refused from now on: the new one collects them all
            const handoverFrom: number | undefined = this.handoverRequests.get(name);
            this.handoverRequests.clear();
            if (handoverFrom !== undefined) {
                this.sendBlocks(name, handoverFrom);
            }

            if (!this.isSequencer) {
                // The entries the former sequencer did not order, and the blocks it sent to some participants only
                this.submitPendingEntries();
                this.requestBlocks(name);
                return;
            }

            // Collects the blocks the former sequencer sent to some participants only, before ordering new ones.
            // The former sequencer is not asked: it is distrusted, and the blocks it sent to the others are collected from them
            this.syncing = true;
            this.syncingSince = undefined;
            for (const participant of this.participants.values()) {
                if (!participant.isLocal && participant.name !== former) {
                    this.requestBlocks(participant.name, true);
                }
            }

            await this.finishSyncIfDone();
        });
    }

    private submitPendingEntries(): void {
        this.ownPendingEntries.forEach((entry: ChainEntry) => this.broadcastEntry(entry));
    }

    private async stopSyncing(): Promise<void> {
        if (!this.syncing) {
            return;
        }

        TimedLogger.warn(`Participants not following ${ this.participants.local.name } on the ${ this.name } chain, it stops waiting for their blocks`, [...this.awaitingBlocksFrom]);
        this.awaitingBlocksFrom.clear();
        await this.finishSyncIfDone();
    }

    private async finishSyncIfDone(): Promise<void> {
        if (!this.syncing || this.awaitingBlocksFrom.size > 0) {
            return;
        }

        this.syncing = false;

        // The entries watched until now were submitted to the former sequencer, or to this one before it took over
        const watchedEntries: ReadonlyArray<ChainEntry> = [...this.watchedEntries.values()].map((watched: WatchedEntry) => watched.entry);

        for (const entry of [...this.ownPendingEntries.values(), ...watchedEntries, ...this.queuedEntries.splice(0)]) {
            // eslint-disable-next-line no-await-in-loop -- the entries are sequenced in their order
            await this.sequence(entry);
        }
    }

    private ownsType(type: string): boolean {
        return this.routing.get(type) === this.name;
    }

    private report(block: Block, reason: CheatReason): void {
        this.antiCheat.report({
            chain: this.name,
            subject: block.hash,
            index: block.index,
            author: block.entry.data.from,
            sequencer: block.sequencer,
            reason,
        });
    }

    public clear(): void {
        this.blockChain.reset();
        this.awaitingBlocksFrom.clear();
        this.handoverRequests.clear();
        this.queuedEntries.splice(0);
        this.entriesWaitingForKey.clear();
        this.ownPendingEntries.clear();
        this.watchedEntries.clear();
        this.leftOut.clear();
        this.deliveredIndex = 0;
        this.syncing = false;
    }
}
