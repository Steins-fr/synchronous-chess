import { DefaultUrlSerializer, UrlTree } from '@angular/router';
import {
    BlockChainMessage,
    BlockChainMessageType,
    BlockInterval,
    ReceivedBlockChainMessage
} from '@app/services/room-manager/classes/webrtc/messages/block-chain-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { BlockRoomInterface } from '../block-room.interface';
import { Block } from './block';
import { BlockToHash, Chain } from './chain';
import { Participant } from './participant';
import { ParticipantReady, ParticipantRegistry } from './participant-registry';
import { WaitingQueue } from './waiting-queue';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { BlockChainName } from '../block-chain-name.enum';

export enum BlockChainState {
    INITIALISING = 'initialising',
    UP_TO_DATE = 'upToDate',
    OUTDATED = 'outdated'
}

type BlockVoteType = BlockChainMessageType.NEW_BLOCK_APPROVED | BlockChainMessageType.NEW_BLOCK_DECLINED;

type MessageHandlers = {
    [K in BlockChainMessageType]: (message: ReceivedBlockChainMessage<K>) => Promise<BlockChainState>;
};

export class DistributedBlockChain {
    /** Bounds the memory taken by the votes of an author whose key never comes, or by forged votes */
    private static readonly MAX_HELD_VOTES_PER_AUTHOR: number = 32;

    private readonly blockChain: Chain;
    private readonly blocksToValidate: WaitingQueue;

    private state: BlockChainState = BlockChainState.INITIALISING;
    private localBlock?: Block;
    /** Votes on the blocks of an author whose public key is being negotiated, by author */
    private readonly votesWaitingForKey: Map<string, Array<ReceivedBlockChainMessage<BlockVoteType>>> = new Map();

    private readonly messageHandler: MessageHandlers = {
        [BlockChainMessageType.NEW_BLOCK_APPROVED]: (message) => this.onBlockVote(message, (block, voter) => this.approveBlockFor(block, voter)),
        [BlockChainMessageType.NEW_BLOCK_DECLINED]: (message) => this.onBlockVote(message, (block, voter) => this.declineBlockFor(block, voter)),
        [BlockChainMessageType.GET_LAST_BLOCK_REQUEST]: (message) => this.onGetLastBlockRequest(message),
        [BlockChainMessageType.GET_LAST_BLOCK_RESPONSE]: (message) => this.onGetLastBlockResponse(message),
        [BlockChainMessageType.GET_BLOCKS_REQUEST]: (message) => this.onGetBlocksRequest(message),
        [BlockChainMessageType.GET_BLOCKS_RESPONSE]: (message) => this.onGetBlocksResponse(message)
    };

    /**
     * @param name the chain name, which is part of the hash of its blocks
     * @param routing the chain of each message type, the blocks of the types of other chains are refused
     */
    public constructor(
        public readonly name: BlockChainName,
        private readonly routing: ReadonlyMap<string, BlockChainName>,
        private readonly blockRoomService: BlockRoomInterface,
        private readonly participants: ParticipantRegistry,
    ) {
        this.blockChain = new Chain(name);
        this.blocksToValidate = new WaitingQueue(participants);
    }

    public handle<K extends BlockChainMessageType>(message: ReceivedBlockChainMessage<K>): void {
        void logHandlingFailure(message, this.process(message));
    }

    private async process<K extends BlockChainMessageType>(message: ReceivedBlockChainMessage<K>): Promise<void> {
        const handler: MessageHandlers[K] = this.messageHandler[message.type];
        this.updateState(await handler(message));
    }

    private initiate(): void {
        if (this.state === BlockChainState.OUTDATED) {
            for (const participant of this.participants.values()) {
                if (!participant.isLocal) {
                    TimedLogger.log('getLastBlock');
                    this.getParticipantLastBlock(participant.name);
                    break;
                }
            }
        }
    }

    public async transmitMessage(type: string, payload: unknown): Promise<void> {
        const playerData: AppMessage = {
            from: this.participants.local.name,
            type,
            payload
        };

        await this.transmitLocalBlock(playerData);
    }

    private async transmitLocalBlock(playerData?: AppMessage): Promise<void> {
        const lastBlock: Block = this.blockChain.getLatestBlock();
        const data = playerData ?? this.localBlock?.data;

        if (!data) {
            TimedLogger.trace('return', data);
            return;
        }

        const blockToHash: BlockToHash = {
            index: lastBlock.index + 1,
            previousHash: lastBlock.hash,
            timestamp: '',
            data,
        };

        const hash: string = await Chain.calculateHash(this.name, blockToHash);
        const signature: string = await Chain.signHash(hash, this.participants.keys.keyPair.privateKey);

        this.localBlock = new Block(blockToHash.index, blockToHash.timestamp, blockToHash.data,
            blockToHash.previousHash, hash, signature);
        await this.approveBlockFor(this.localBlock, this.participants.local);
    }

    private sendBlock(block: Block, type: BlockChainMessageType.NEW_BLOCK_APPROVED | BlockChainMessageType.NEW_BLOCK_DECLINED): void {
        const roomServiceMessage: BlockChainMessage = {
            type,
            payload: block,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        };

        const currentSearchString: string = window.location.search;
        const urlSerializer: DefaultUrlSerializer = new DefaultUrlSerializer();
        const url: UrlTree = urlSerializer.parse(`/${ currentSearchString }`);

        const latencyString = url.queryParamMap.get('latency');
        if (latencyString) {
            // TimedLogger.log(`Will send block declined after ${url.queryParams.latency}ms`, roomServiceMessage.payload);
            setTimeout(() => this.participants.broadcast(roomServiceMessage), Number.parseInt(latencyString, 10));
        } else {
            this.participants.broadcast(roomServiceMessage);
        }
    }

    private sendApproveBlock(block: Block): void {
        this.sendBlock(block, BlockChainMessageType.NEW_BLOCK_APPROVED);
    }

    private sendDeclineBlock(block: Block): void {
        this.sendBlock(block, BlockChainMessageType.NEW_BLOCK_DECLINED);
    }

    private updateState(state: BlockChainState): void {
        // TimedLogger.log(state);
        if (this.state !== state) {
            this.state = state;
            // TimedLogger.log('initiate');
            this.initiate();
        }
    }

    public onParticipantReady(ready: ParticipantReady): void {
        const heldVotes: ReadonlyArray<ReceivedBlockChainMessage<BlockVoteType>> = this.votesWaitingForKey.get(ready.name) ?? [];
        this.votesWaitingForKey.delete(ready.name);
        void this.replayVotes(heldVotes, ready.name);

        if (this.participants.readyCount >= ready.nbParticipants * 2.0 / 3.0) {
            TimedLogger.log('getLastBlock');
            this.getParticipantLastBlock(ready.name);
            this.updateState(BlockChainState.UP_TO_DATE);
        }
    }

    /**
     * Replayed one after the other in their arrival order: a vote on a block handled before the block it follows is committed
     * would decline it. The new voter is then counted in the approvals already received.
     */
    private async replayVotes(votes: ReadonlyArray<ReceivedBlockChainMessage<BlockVoteType>>, readyName: string): Promise<void> {
        for (const vote of votes) {
            await logHandlingFailure(vote, this.process(vote));
        }

        await this.recheckPendingBlocks(`${ readyName } is ready`);
    }

    /** The voters changed, so the approval threshold and the counted approvals: the pending blocks may be approved now */
    public onParticipantLeft(name: string): void {
        this.votesWaitingForKey.delete(name);
        void this.recheckPendingBlocks(`${ name } left`);
    }

    private async recheckPendingBlocks(reason: string): Promise<void> {
        await this.commitPendingBlocks()
            .catch((error: unknown) => TimedLogger.error(`Failed to commit the pending blocks once ${ reason }`, error));
    }

    private async commitPendingBlocks(): Promise<void> {
        for (const block of this.blocksToValidate.pendingBlocks()) {
            // Checked once the hash is, the chain may have changed in the meantime
            if (await this.blockChain.hasValidHash(block) && this.blockChain.canAppend(block)) {
                this.commitIfApproved(block);
            }
        }
    }

    private async approveBlockFor(block: Block, participant: Participant): Promise<void> {
        if (!(await this.blockChain.hasValidHash(block) && this.blockChain.canAppend(block))) {
            if (block.hash === this.localBlock?.hash) {
                await this.transmitLocalBlock();
            } else if (!this.blocksToValidate.blockIsApproved(block)) {
                // Some block could be already approved and pushed into the chain, decline only not approved one
                this.blocksToValidate.declineBlock(block, this.participants.local);
                this.sendDeclineBlock(block);
            }
            TimedLogger.log('decline', block);
            return;
        }
        // TimedLogger.log(block);

        if (!this.blocksToValidate.hasBlock(block)) {
            if (this.blocksToValidate.approveBlock(block, this.participants.local)) {
                this.sendApproveBlock(block);
            } else {
                this.sendDeclineBlock(block);
            }
        }

        this.blocksToValidate.approveBlock(block, participant);
        this.commitIfApproved(block);
    }

    /** The block must be appendable */
    private commitIfApproved(block: Block): void {
        if (!this.blocksToValidate.blockJustApproved(block)) {
            return;
        }

        this.append(block);
        this.transmitPendingLocalBlock();
    }

    /** Added by a commit or by a catch up */
    private append(block: Block): void {
        this.blockChain.append(block);

        if (this.localBlock?.hash === block.hash) {
            this.localBlock = undefined;
        }

        this.blocksToValidate.clearOldBlock(block.index);
        this.dropStaleVotes(block.index);
        this.blockRoomService.notifyMessage(block);
    }

    /** The local block lost its place in the chain to another block: it is transmitted again after the latest one */
    private transmitPendingLocalBlock(): void {
        if (this.localBlock && !this.blockChain.canAppend(this.localBlock)) {
            TimedLogger.log('transmit local');
            void this.transmitLocalBlock();
        }
    }

    /** The held votes on the blocks at or before a committed index can not change the chain anymore */
    private dropStaleVotes(committedIndex: number): void {
        for (const [author, votes] of this.votesWaitingForKey) {
            const pendingVotes = votes.filter((vote: ReceivedBlockChainMessage<BlockVoteType>) => vote.payload.index > committedIndex);

            if (pendingVotes.length > 0) {
                this.votesWaitingForKey.set(author, pendingVotes);
            } else {
                this.votesWaitingForKey.delete(author);
            }
        }
    }

    private async declineBlockFor(block: Block, participant: Participant): Promise<void> {
        if (!this.blocksToValidate.hasBlock(block)) {
            if (this.blocksToValidate.approveBlock(block, this.participants.local)) {
                this.sendApproveBlock(block);
            } else {
                this.sendDeclineBlock(block);
            }
        }

        this.blocksToValidate.declineBlock(block, participant);
    }

    private ownsBlock(block: Block): boolean {
        return this.routing.get(block.data.type) === this.name;
    }

    private holdVote(author: string, vote: ReceivedBlockChainMessage<BlockVoteType>): void {
        const votes = [...this.votesWaitingForKey.get(author) ?? [], vote];
        this.votesWaitingForKey.set(author, votes.slice(-DistributedBlockChain.MAX_HELD_VOTES_PER_AUTHOR));
    }

    private async isSignedWithOneOf(block: Block, keys: ReadonlyArray<CryptoKey>): Promise<boolean> {
        for (const key of keys) {
            if (await Chain.verifyMessage(block.signature, block.hash, key)) {
                return true;
            }
        }

        return false;
    }

    private async onBlockVote(
        message: ReceivedBlockChainMessage<BlockVoteType>,
        vote: (block: Block, voter: Participant) => Promise<void>,
    ): Promise<BlockChainState> {
        const block: Block = message.payload;
        const author: Participant | undefined = this.participants.author(block.data.from);
        const voter: Participant | undefined = this.participants.get(message.from);

        if (!author || !voter) {
            return BlockChainState.UP_TO_DATE;
        }

        if (!this.ownsBlock(block)) {
            throw new Error(`${ block.data.type } messages do not belong to the ${ this.name } chain`);
        }

        // A copy, from the newest key which signs the live blocks: the key of the author may be received while verifying
        const keys: ReadonlyArray<CryptoKey> = [...author.knownKeys].reverse();

        if (!await this.isSignedWithOneOf(block, keys)) {
            if (author.knownKeys.length > keys.length) {
                // A key has been received while verifying
                return await this.onBlockVote(message, vote);
            }

            // Signed with a key not received yet, the author may be reconnecting: refusing the block would fork the chain
            // from the peers who already know that key. A forged vote stays held until it is stale, and is never counted.
            this.holdVote(author.name, message);
            return this.state;
        }

        await vote(block, voter);

        return BlockChainState.UP_TO_DATE;
    }

    private async onGetLastBlockRequest(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_LAST_BLOCK_REQUEST>): Promise<BlockChainState> {

        const roomServiceMessage: BlockChainMessage = {
            type: BlockChainMessageType.GET_LAST_BLOCK_RESPONSE,
            payload: this.blockChain.getLatestBlock(),
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        };

        this.participants.send(message.from, roomServiceMessage);

        return this.state;
    }

    private async onGetLastBlockResponse(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_LAST_BLOCK_RESPONSE>): Promise<BlockChainState> {

        const block: Block = message.payload;
        const lastBlock: Block = this.blockChain.getLatestBlock();

        if (block.hash !== lastBlock.hash && block.index > lastBlock.index) {
            const roomServiceMessage: BlockChainMessage = {
                type: BlockChainMessageType.GET_BLOCKS_REQUEST,
                payload: { from: lastBlock.index + 1, to: block.index },
                origin: MessageOriginType.BLOCK_ROOM_SERVICE,
                chain: this.name,
            };

            this.participants.send(message.from, roomServiceMessage);

            return BlockChainState.OUTDATED;
        }

        return BlockChainState.UP_TO_DATE;
    }

    private async onGetBlocksRequest(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_BLOCKS_REQUEST>): Promise<BlockChainState> {
        // Answer can't do response
        const interval: BlockInterval = message.payload;

        const blocks: Block[] = [];

        for (let i: number = interval.from; i <= interval.to; ++i) {
            blocks.push(this.blockChain.getBlock(i));
        }

        const roomServiceMessage: BlockChainMessage = {
            type: BlockChainMessageType.GET_BLOCKS_RESPONSE,
            payload: blocks,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        };

        this.participants.send(message.from, roomServiceMessage);

        return this.state;
    }

    /**
     * The history is trusted on the hash chain of the peer, the signatures are not verified:
     * each connection of a player has its own key pair, so the keys of the blocks signed before the current
     * connections are unknown, even to their author after a reload. The live blocks are verified.
     */
    private async onGetBlocksResponse(message: ReceivedBlockChainMessage<BlockChainMessageType.GET_BLOCKS_RESPONSE>): Promise<BlockChainState> {

        for (const block of message.payload) {
            const isValid: boolean = this.ownsBlock(block) && await this.blockChain.hasValidHash(block);

            // Checked after the hash: overlapping responses from several peers carry the same blocks, and may have added it meanwhile
            if (this.blockChain.contains(block)) {
                continue;
            }

            if (!isValid || !this.blockChain.canAppend(block)) {
                // Asking this peer again would send back the same refused block, endlessly
                TimedLogger.error(`Block ${ block.index } from ${ message.from } refused, stop catching up with it`);
                this.transmitPendingLocalBlock();
                return this.state;
            }

            this.append(block);
        }

        this.transmitPendingLocalBlock();

        TimedLogger.log('getLastBlock');
        this.getParticipantLastBlock(message.from);

        return BlockChainState.OUTDATED;
    }

    private getParticipantLastBlock(participantName: string): void {
        const roomServiceMessage: BlockChainMessage = {
            type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
            payload: null,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE,
            chain: this.name,
        };

        this.participants.send(participantName, roomServiceMessage);
    }

    public clear(): void {
        this.blocksToValidate.clear();
        this.votesWaitingForKey.clear();
        this.localBlock = undefined;
        this.state = BlockChainState.INITIALISING;
        this.blockChain.reset();
    }
}
