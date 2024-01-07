import { RoomServiceMessage } from './room-service-message';
import { BlockChainMessageType } from '../../../services/room/block-room/block-chain/distributed-block-chain';

export type BlockChainMessage<T = unknown> = RoomServiceMessage<BlockChainMessageType, T>;
