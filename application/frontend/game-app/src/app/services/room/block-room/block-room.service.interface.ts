import { Block } from './block-chain/block';
import { Player } from '@app/classes/player/player';

export interface BlockRoomServiceInterface {

    get localPlayer(): Player;
    set localPlayer(value: Player);

    players: Map<string, Player>;

    transmitMessage<T>(type: string, message: T): Promise<void>;

    notifyMessage(block: Block): void;

    isReady(): boolean;

    clear(): void;
}
