import { Block } from './block-chain/block';

export interface BlockRoomInterface {
    notifyMessage(block: Block): void;
}
