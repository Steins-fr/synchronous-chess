import { RoomMessage } from './room-message';

export enum HostRoomMessageType {
    NEW_PLAYER = 'newPlayer',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface HostRoomMessage<U> extends RoomMessage<U> {
    type: HostRoomMessageType;
}
