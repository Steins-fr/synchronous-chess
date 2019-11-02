import { RoomMessage } from './room-message';

export enum PlayerMessageType {
    PING = 'ping',
    PONG = 'pong'
}

export interface PlayerMessage extends RoomMessage {
    type: PlayerMessageType;
}
