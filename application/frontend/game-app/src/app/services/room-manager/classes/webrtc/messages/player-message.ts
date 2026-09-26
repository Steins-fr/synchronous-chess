import { EnvelopesOf } from './envelope';
import MessageOriginType from './message-origin.types';

export enum PlayerMessageType {
    PING = 'ping',
    PONG = 'pong'
}

export interface PlayerPayloads {
    [PlayerMessageType.PING]: string;
    [PlayerMessageType.PONG]: string;
}

export type PlayerMessage = EnvelopesOf<MessageOriginType.PLAYER, PlayerPayloads>;
