import { RoomMessage } from './room-message';

export enum PlayerMessageType {
    PING = 'ping',
    PONG = 'pong'
}

export interface PlayerMessage<U = unknown> extends RoomMessage<U> {
    type: PlayerMessageType;
}
