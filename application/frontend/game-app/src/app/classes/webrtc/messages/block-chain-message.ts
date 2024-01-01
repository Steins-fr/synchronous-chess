import { RoomMessage } from './room-message';
import { BlockChainMessageType } from '@app/services/room-manager/classes/block-room/block-chain/distributed-block-chain';

export type BlockChainMessage<T = unknown> = RoomMessage<BlockChainMessageType, T>;
