import { BlockChainName } from './block-chain-name.enum';
import { Block } from './block-chain/block';

export interface BlockRoomInterface {
    /** Delivers the message of a block to the application */
    notifyMessage(chain: BlockChainName, block: Block): void;
}
