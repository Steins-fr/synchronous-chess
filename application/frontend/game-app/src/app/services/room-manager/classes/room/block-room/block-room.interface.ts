import { Signal } from '@angular/core';
import { Player } from '../../player/player';
import { Block } from './block-chain/block';

export interface BlockRoomInterface {

    get localPlayer(): Player;
    set localPlayer(value: Player);

    readonly players: Signal<ReadonlyArray<Readonly<Player>>>;

    transmitMessage<T>(type: string, message: T): void;

    notifyMessage(block: Block): void;

    clear(): void;
}
