import { Player } from '../player/player';
import { Block } from './block-chain/block';

export interface BlockRoomInterface {

    get localPlayer(): Player;
    set localPlayer(value: Player);

    players: Map<string, Player>;

    transmitMessage<T>(type: string, message: T): void;

    notifyMessage(block: Block): void;

    clear(): void;
}
