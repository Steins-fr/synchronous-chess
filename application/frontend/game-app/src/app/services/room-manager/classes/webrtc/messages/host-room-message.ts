import { RtcSignal } from '@protocol/rtc-signal';
import { EnvelopesOf } from './envelope';
import MessageOriginType from './message-origin.types';

export enum HostRoomMessageType {
    NEW_PLAYER = 'newPlayer',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface NewPlayerPayload {
    playerName: string;
}

/** A signal the host relays over the data channel, from the peer `from` */
export interface RemoteSignalPayload {
    from: string;
    signal: RtcSignal;
}

export interface HostRoomPayloads {
    [HostRoomMessageType.NEW_PLAYER]: NewPlayerPayload;
    [HostRoomMessageType.REMOTE_SIGNAL]: RemoteSignalPayload;
}

export type HostRoomMessage = EnvelopesOf<MessageOriginType.HOST_ROOM, HostRoomPayloads>;
