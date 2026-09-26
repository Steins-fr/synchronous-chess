import { Block } from '@app/services/room-manager/classes/room/block-room/block-chain/block';
import { EnvelopesOf, Received } from './envelope';
import MessageOriginType from './message-origin.types';

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

export interface BlockInterval {
    from: number;
    to: number;
}

export interface NegotiationPayload {
    publicKey: JsonWebKey;
    nbParticipants: number;
}

export interface BlockChainPayloads {
    [BlockChainMessageType.NEW_BLOCK_APPROVED]: Block;
    [BlockChainMessageType.NEW_BLOCK_DECLINED]: Block;
    [BlockChainMessageType.NEGOTIATION_REQUEST]: null;
    [BlockChainMessageType.NEGOTIATION_RESPONSE]: NegotiationPayload;
    [BlockChainMessageType.GET_LAST_BLOCK_REQUEST]: null;
    [BlockChainMessageType.GET_LAST_BLOCK_RESPONSE]: Block;
    [BlockChainMessageType.GET_BLOCKS_REQUEST]: BlockInterval;
    [BlockChainMessageType.GET_BLOCKS_RESPONSE]: ReadonlyArray<Block>;
}

export type BlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> =
    EnvelopesOf<MessageOriginType.BLOCK_ROOM_SERVICE, BlockChainPayloads, K>;

export type ReceivedBlockChainMessage<K extends BlockChainMessageType = BlockChainMessageType> = Received<BlockChainMessage<K>>;
