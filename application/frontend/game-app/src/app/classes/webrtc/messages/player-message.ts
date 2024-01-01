import { ToReworkMessage } from './to-rework-message';

export enum PlayerMessageType {
    PING = 'ping',
    PONG = 'pong'
}

export interface PlayerMessage<U = unknown> extends ToReworkMessage<U> {
    type: PlayerMessageType;
}
