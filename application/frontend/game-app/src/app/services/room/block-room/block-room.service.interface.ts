import { Block } from './block-chain/block';
import { Player } from '../../../classes/player/player';

export interface BlockRoomServiceInterface {

    localPlayer?: Player;
    players: Map<string, Player>;

    transmitMessage<T>(type: string, message: T): Promise<void>;

    notifyMessage(block: Block): void;

    isReady(): boolean;

    clear(): void;
}
