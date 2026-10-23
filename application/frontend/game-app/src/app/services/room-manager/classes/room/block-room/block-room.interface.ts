import { BlockChainName } from './block-chain-name.enum';
import { Block } from './block-chain/block';

export interface BlockRoomInterface {
    /**
     * Delivers the message of a block to the application
     * @param history whether the block was in the chain before this participant caught up with it
     */
    notifyMessage(chain: BlockChainName, block: Block, history: boolean): void;
}
