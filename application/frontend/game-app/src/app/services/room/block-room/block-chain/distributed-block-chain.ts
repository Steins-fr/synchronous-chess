import {
    BlockRoomServiceInterface
} from '../block-room.service.interface';
import { Player } from '../../../../classes/player/player';
import { BlockToHash, Chain } from './chain';
import { RoomServiceMessage } from '../../../../classes/webrtc/messages/room-service-message';
import { Block, PlayerData } from './block';
import MessageOriginType from '../../../../classes/webrtc/messages/message-origin.types';
import { Participant } from './participant';
import { BlockChainMessage } from '../../../../classes/webrtc/messages/block-chain-message';
import { keyPairAlgorithm } from './block-chain.constants';
import { WaitingQueue } from './waiting-queue';
import { DefaultUrlSerializer, UrlTree } from '@angular/router';

export enum BlockChainMessageType {
    NEW_BLOCK_APPROVED = 'newBlockApproved',
    NEW_BLOCK_DECLINED = 'newBlockDeclined',
    NEGOTIATION_REQUEST = 'getPublicKeyRequest',
    NEGOTIATION_RESPONSE = 'getPublicKeyResponse',
    GET_LAST_BLOCK_REQUEST = 'getLastBlockRequest',
    GET_LAST_BLOCK_RESPONSE = 'getLastBlockResponse',
    GET_BLOCKS_REQUEST = 'getBlocksRequest',
    GET_BLOCKS_RESPONSE = 'getBlocksResponse',
}

interface BlockInterval {
    from: number;
    to: number;
}

interface NegotiationPayload {
    publicKey: JsonWebKey;
    nbParticipants: number;
}

export enum BlockChainState {
    INITIALISING = 'initialising',
    UP_TO_DATE = 'upToDate',
    OUTDATED = 'outdated'
}

type MessageHandlers = {
    [key in BlockChainMessageType]: (message: BlockChainMessage) => Promise<BlockChainState>;
};

export class DistributedBlockChain {

    private state: BlockChainState = BlockChainState.INITIALISING;
    private blockChain?: Chain;
    private myKeyPair: CryptoKeyPair;
    private readonly participants: Map<string, Participant> = new Map();
    private localParticipant: Participant;
    private localBlock: Block;
    private readonly blocksToValidate: WaitingQueue = new WaitingQueue();

    private readonly messageHandler: MessageHandlers = {
        [BlockChainMessageType.NEW_BLOCK_APPROVED]: (message: BlockChainMessage<Block>): Promise<BlockChainState> => this.onNewBlockApproved(message),
        [BlockChainMessageType.NEW_BLOCK_DECLINED]: (message: BlockChainMessage<Block>): Promise<BlockChainState> => this.onNewBlockDeclined(message),
        [BlockChainMessageType.NEGOTIATION_REQUEST]: (message: BlockChainMessage<void>): Promise<BlockChainState> => this.onNegotiationRequest(message),
        [BlockChainMessageType.NEGOTIATION_RESPONSE]: (message: BlockChainMessage<NegotiationPayload>): Promise<BlockChainState> => this.onNegotiationResponse(message),
        [BlockChainMessageType.GET_LAST_BLOCK_REQUEST]: (message: BlockChainMessage<Block>): Promise<BlockChainState> => this.onGetLastBlockRequest(message),
        [BlockChainMessageType.GET_LAST_BLOCK_RESPONSE]: (message: BlockChainMessage<Block>): Promise<BlockChainState> => this.onGetLastBlockResponse(message),
        [BlockChainMessageType.GET_BLOCKS_REQUEST]: (message: BlockChainMessage<BlockInterval>): Promise<BlockChainState> => this.onGetBlocksRequest(message),
        [BlockChainMessageType.GET_BLOCKS_RESPONSE]: (message: BlockChainMessage<Block[]>): Promise<BlockChainState> => this.onGetBlocksResponse(message)
    };

    public constructor(protected blockRoomService: BlockRoomServiceInterface) {
        window.crypto.subtle.generateKey(keyPairAlgorithm, true, ['sign', 'verify'])
            .then((keyPair: CryptoKeyPair) => {
                this.myKeyPair = keyPair;
            });
    }

    public handle(message: BlockChainMessage): void {
        this.messageHandler[message.type](message).then((state: BlockChainState) => this.updateState(state));
    }

    public support(message: BlockChainMessage): boolean {
        return this.messageHandler[message.type] !== undefined;
    }

    public initiate(): void {
        if (!this.blockChain) {
            this.blockChain = new Chain();
        }

        if (this.state === BlockChainState.OUTDATED) {
            for (const participant of this.participants.values()) {
                if (!participant.isLocal()) {
                    console.log('getLastBlock');
                    this.getParticipantLastBlock(participant.name);
                    break;
                }
            }
        }
    }

    public async transmitMessage<T>(type: string, message: T): Promise<void> {
        if (this.blockRoomService.isReady()) {

            const playerData: PlayerData = {
                from: this.blockRoomService.localPlayer.name,
                type,
                payload: message
            };

            await this.transmitLocalBlock(playerData);
        }
    }

    private async transmitLocalBlock(playerData?: PlayerData): Promise<void> {
        const lastBlock: Block = this.blockChain.getLatestBlock();

        if (!playerData && !this.localBlock) {
            console.log('return');
            return;
        }

        const blockToHash: BlockToHash = {
            index: lastBlock.index + 1,
            previousHash: lastBlock.hash,
            timestamp: '',
            data: playerData ?? this.localBlock.data
        };

        const hash: string = await Chain.calculateHash(blockToHash);
        const signature: string = await Chain.signHash(hash, this.myKeyPair.privateKey);

        this.localBlock = new Block(blockToHash.index, blockToHash.timestamp, blockToHash.data,
            blockToHash.previousHash, hash, signature);
        await this.approveBlockFor(this.localBlock, this.localParticipant);
    }

    private sendMessage(roomServiceMessage: BlockChainMessage<Block>): void {
        this.participants.forEach((participant: Participant) => {
            participant.sendMessage(roomServiceMessage);
        });
    }

    private sendBlock(block: Block, type: BlockChainMessageType): void {
        const roomServiceMessage: BlockChainMessage<Block> = {
            type,
            payload: block,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        const currentSearchString: string = window.location.search;
        const urlSerializer: DefaultUrlSerializer = new DefaultUrlSerializer();
        const url: UrlTree = urlSerializer.parse(`/${currentSearchString}`);

        if (url.queryParams.latency) {
            // console.log(`Will send block declined after ${url.queryParams.latency}ms`, roomServiceMessage.payload);
            setTimeout(() => this.sendMessage(roomServiceMessage), parseInt(url.queryParams.latency, 10));
        } else {
            this.sendMessage(roomServiceMessage);
        }
    }

    private sendApproveBlock(block: Block): void {
        this.sendBlock(block, BlockChainMessageType.NEW_BLOCK_APPROVED);
    }

    private sendDeclineBlock(block: Block): void {
        this.sendBlock(block, BlockChainMessageType.NEW_BLOCK_DECLINED);
    }

    public onMessage(message: BlockChainMessage): void {
        if (this.support(message)) {
            this.handle(message);
        }
    }

    private updateState(state: BlockChainState): void {
        // console.log(state);
        // console.log(this);
        if (this.state !== state) {
            this.state = state;
            // console.log('initiate');
            this.initiate();
        }
    }

    private async onNegotiationRequest(message: BlockChainMessage<void>): Promise<BlockChainState> {

        const response: BlockChainMessage<NegotiationPayload> = {
            type: BlockChainMessageType.NEGOTIATION_RESPONSE,
            payload: {
                nbParticipants: this.participants.size,
                publicKey: await crypto.subtle.exportKey('jwk', this.myKeyPair.publicKey)
            },
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        this.sendToParticipant(message.from, response);

        return this.state;
    }

    private async onNegotiationResponse(message: BlockChainMessage<NegotiationPayload>): Promise<BlockChainState> {

        const negotiationPayload: NegotiationPayload = message.payload;

        const participant: Participant = this.participants.get(message.from);

        if (participant) {
            participant.publicKey = await crypto.subtle.importKey(
                'jwk',
                negotiationPayload.publicKey,
                keyPairAlgorithm,
                true,
                ['verify']
            );

            let nbReady: number = 0;
            this.participants.forEach((p: Participant) => nbReady += p.isReady() ? 1 : 0);
            this.blocksToValidate.participantNumber = nbReady;

            if (nbReady >= negotiationPayload.nbParticipants * 2.0 / 3.0) {
                console.log('getLastBlock');
                this.getParticipantLastBlock(message.from);
                return BlockChainState.UP_TO_DATE;
            }
        }

        return this.state;
    }

    private async approveBlockFor(block: Block, participant: Participant): Promise<void> {

        if (!await this.blockChain.canAddBlockAsync(block)) {
            if (block.hash === this.localBlock?.hash) {
                await this.transmitLocalBlock();
            } else if (!this.blocksToValidate.blockIsApproved(block)) {
                // Some block could be already approved and pushed into the chain, decline only not approved one
                this.blocksToValidate.declineBlock(block, this.localParticipant);
                this.sendDeclineBlock(block);
            }
            console.log('decline', block);
            return;
        }
        // console.log(block);

        if (!this.blocksToValidate.hasBlock(block)) {
            if (this.blocksToValidate.approveBlock(block, this.localParticipant)) {
                this.sendApproveBlock(block);
            } else {
                this.sendDeclineBlock(block);
            }
        }

        this.blocksToValidate.approveBlock(block, participant);

        if (this.blocksToValidate.blockJustApproved(block)) {
            this.blockChain.addBlock(block).then(() => {
                if (this.localBlock?.hash === block.hash) {
                    this.localBlock = undefined;
                } else if (this.localBlock) {
                    console.log('transmit local');

                    this.transmitLocalBlock();
                }
                this.blocksToValidate.clearOldBlock(block.index);
                this.blockRoomService.notifyMessage(block);
            }).catch((reason: unknown) => {
                console.log(reason);
            });
        }
    }

    private async declineBlockFor(block: Block, participant: Participant): Promise<void> {

        if (!this.blocksToValidate.hasBlock(block)) {
            if (this.blocksToValidate.approveBlock(block, this.localParticipant)) {
                this.sendApproveBlock(block);
            } else {
                this.sendDeclineBlock(block);
            }
        }

        this.blocksToValidate.declineBlock(block, participant);
    }

    private async validateMessage(message: BlockChainMessage<Block>): Promise<void> {
        const blockFrom: Participant = this.participants.get(message.payload.data.from);

        if (!await Chain.verifyMessage(message.payload.signature, message.payload.hash, blockFrom.publicKey)) {
            throw new Error('Someone try to play as another player');
        }
    }

    private async onNewBlockApproved(message: BlockChainMessage<Block>): Promise<BlockChainState> {

        const blockFrom: Participant = this.participants.get(message.payload.data.from);
        const blockApprovedBy: Participant = this.participants.get(message.from);

        if (blockFrom && blockApprovedBy) {
            await this.validateMessage(message);
            await this.approveBlockFor(message.payload, blockApprovedBy);
        }

        return BlockChainState.UP_TO_DATE;
    }

    private async onNewBlockDeclined(message: BlockChainMessage<Block>): Promise<BlockChainState> {

        const blockFrom: Participant = this.participants.get(message.payload.data.from);
        const blockDeclinedBy: Participant = this.participants.get(message.from);

        if (blockFrom && blockDeclinedBy) {
            await this.validateMessage(message);
            await this.declineBlockFor(message.payload, blockDeclinedBy);
        }

        return BlockChainState.UP_TO_DATE;
    }

    private async onGetLastBlockRequest(message: RoomServiceMessage): Promise<BlockChainState> {

        const roomServiceMessage: BlockChainMessage<Block> = {
            type: BlockChainMessageType.GET_LAST_BLOCK_RESPONSE,
            payload: this.blockChain.getLatestBlock(),
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        this.sendToParticipant(message.from, roomServiceMessage);

        return this.state;
    }

    private async onGetLastBlockResponse(message: BlockChainMessage<Block>): Promise<BlockChainState> {

        const block: Block = message.payload;
        const lastBlock: Block = this.blockChain.getLatestBlock();

        if (block.hash !== lastBlock.hash && block.index > lastBlock.index) {
            const roomServiceMessage: BlockChainMessage<BlockInterval> = {
                type: BlockChainMessageType.GET_BLOCKS_REQUEST,
                payload: { from: lastBlock.index + 1, to: block.index },
                origin: MessageOriginType.BLOCK_ROOM_SERVICE
            };

            this.sendToParticipant(message.from, roomServiceMessage);

            return BlockChainState.OUTDATED;
        }

        return BlockChainState.UP_TO_DATE;
    }

    private async onGetBlocksRequest(message: BlockChainMessage<BlockInterval>): Promise<BlockChainState> {
        // Answer can't do response
        const interval: BlockInterval = message.payload;

        const blocks: Block[] = [];

        for (let i: number = interval.from; i <= interval.to; ++i) {
            blocks.push(this.blockChain.getBlock(i));
        }

        const roomServiceMessage: BlockChainMessage<Block[]> = {
            type: BlockChainMessageType.GET_BLOCKS_RESPONSE,
            payload: blocks,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        this.sendToParticipant(message.from, roomServiceMessage);

        return this.state;
    }

    private async onGetBlocksResponse(message: BlockChainMessage<Block[]>): Promise<BlockChainState> {

        const blocks: Block[] = message.payload;

        try {
            for (const block of blocks) {
                console.log(await this.blockChain.canAddBlockAsync(block), block);
                if (!await this.blockChain.canAddBlockAsync(block)) {
                    console.error('break');
                    break;
                }

                await this.blockChain.addBlock(block);
                this.blockRoomService.notifyMessage(block);
            }
        } catch (reason) {
            console.error('Multiple response will arrive at the same time, the last one will trigger errors. Task: Distributed retrieval', reason);
        }

        console.log('getLastBlock');
        this.getParticipantLastBlock(message.from);

        return BlockChainState.OUTDATED;
    }

    protected sendToParticipant(playerName: string, message: BlockChainMessage): void {
        message.from = this.blockRoomService.localPlayer.name;
        const participant: Participant | null = this.participants.get(playerName);

        if (participant) {
            participant.sendMessage(message);
        }
    }

    public onNewPlayer(player: Player): void {
        this.participants.set(player.name, new Participant(player));
        if (!player.isLocal()) {
            this.sendNegotiation(player.name);
        } else {
            this.localParticipant = this.participants.get(player.name);
            this.localParticipant.publicKey = this.myKeyPair.publicKey;
            this.blocksToValidate.localParticipant = this.localParticipant;
        }
    }

    public sendNegotiation(participantName: string): void {
        const roomServiceMessage: BlockChainMessage = {
            type: BlockChainMessageType.NEGOTIATION_REQUEST,
            payload: null,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        this.sendToParticipant(participantName, roomServiceMessage);
    }

    private getParticipantLastBlock(participantName: string): void {
        const roomServiceMessage: BlockChainMessage = {
            type: BlockChainMessageType.GET_LAST_BLOCK_REQUEST,
            payload: null,
            origin: MessageOriginType.BLOCK_ROOM_SERVICE
        };

        this.sendToParticipant(participantName, roomServiceMessage);
    }
}
