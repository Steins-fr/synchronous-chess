import { ToReworkMessage } from './to-rework-message';

export enum HostRoomMessageType {
    NEW_PLAYER = 'newPlayer',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface HostRoomMessage<U> extends ToReworkMessage<U> {
    type: HostRoomMessageType;
}
