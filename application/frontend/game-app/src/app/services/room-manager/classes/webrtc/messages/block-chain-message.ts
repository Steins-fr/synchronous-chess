import { Block, ChainEntry, ChainHead } from '@app/services/room-manager/classes/room/block-room/block-chain/block';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

export enum BlockChainMessageType {
    /** An entry of a participant, sent to the sequencer which orders it, and to the others which watch it is ordered */
    SUBMIT_ENTRY = 'submitEntry',
    /** A block ordered by the sequencer, sent to all the participants */
    NEW_BLOCK = 'newBlock',
    GET_BLOCKS_REQUEST = 'getBlocksRequest',
    GET_BLOCKS_RESPONSE = 'getBlocksResponse',
    /** The latest block of a participant, to detect a sequencer sending different blocks to the participants */
    CHAIN_HEAD = 'chainHead',
}

export interface BlocksRequest {
    /** The index of the first block, the response goes as far as it can */
    from: number;
    /**
     * Sent by a new sequencer collecting the blocks of the participants: answered once the participant follows it too,
     * so that the blocks the former sequencer sends meanwhile all reach it
     */
    handover?: boolean;
}

export interface BlockChainPayloads {
    [BlockChainMessageType.SUBMIT_ENTRY]: ChainEntry;
    [BlockChainMessageType.NEW_BLOCK]: Block;
    [BlockChainMessageType.GET_BLOCKS_REQUEST]: BlocksRequest;
    [BlockChainMessageType.GET_BLOCKS_RESPONSE]: ReadonlyArray<Block>;
    [BlockChainMessageType.CHAIN_HEAD]: ChainHead;
}

/** `chain` names the block chain of the room the message belongs to, a room may run several of them */
export type BlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> =
    EnvelopesOf<MessageOriginType.BLOCK_ROOM_SERVICE, BlockChainPayloads, K> & { readonly chain: BlockChainName };

export type ReceivedBlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> = Received<BlockChainMessage<K>>;
