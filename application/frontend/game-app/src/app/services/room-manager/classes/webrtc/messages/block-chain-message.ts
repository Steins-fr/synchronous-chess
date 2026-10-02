import { Block, ChainEntry } from '@app/services/room-manager/classes/room/block-room/block-chain/block';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

export enum BlockChainMessageType {
    /** An entry of a participant, sent to the sequencer */
    SUBMIT_ENTRY = 'submitEntry',
    /** A block ordered by the sequencer, sent to all the participants */
    NEW_BLOCK = 'newBlock',
    GET_BLOCKS_REQUEST = 'getBlocksRequest',
    GET_BLOCKS_RESPONSE = 'getBlocksResponse',
}

export interface BlocksRequest {
    /** The index of the first block, the response goes as far as it can */
    from: number;
}

export interface BlockChainPayloads {
    [BlockChainMessageType.SUBMIT_ENTRY]: ChainEntry;
    [BlockChainMessageType.NEW_BLOCK]: Block;
    [BlockChainMessageType.GET_BLOCKS_REQUEST]: BlocksRequest;
    [BlockChainMessageType.GET_BLOCKS_RESPONSE]: ReadonlyArray<Block>;
}

/** `chain` names the block chain of the room the message belongs to, a room may run several of them */
export type BlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> =
    EnvelopesOf<MessageOriginType.BLOCK_ROOM_SERVICE, BlockChainPayloads, K> & { readonly chain: BlockChainName };

export type ReceivedBlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> = Received<BlockChainMessage<K>>;
