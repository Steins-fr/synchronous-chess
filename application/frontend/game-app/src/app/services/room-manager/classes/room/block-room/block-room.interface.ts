import { Player } from '../../player/player';
import { Block } from './block-chain/block';

export interface BlockRoomInterface {

    get localPlayer(): Player;
    set localPlayer(value: Player);

    notifyMessage(block: Block): void;

    clear(): void;
}
