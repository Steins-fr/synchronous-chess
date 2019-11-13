import { RoomMessage } from './room-message';

export enum PlayerMessageType {
    PING = 'ping',
    PONG = 'pong'
}

export interface PlayerMessage<U = any> extends RoomMessage<U> {
    type: PlayerMessageType;
}
