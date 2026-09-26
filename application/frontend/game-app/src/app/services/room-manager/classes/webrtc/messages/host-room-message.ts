import RtcSignalResponse from '@app/services/room-api/responses/rtc-signal-response';
import { EnvelopesOf } from './envelope';
import MessageOriginType from './message-origin.types';

export enum HostRoomMessageType {
    NEW_PLAYER = 'newPlayer',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface NewPlayerPayload {
    playerName: string;
}

export interface HostRoomPayloads {
    [HostRoomMessageType.NEW_PLAYER]: NewPlayerPayload;
    [HostRoomMessageType.REMOTE_SIGNAL]: RtcSignalResponse;
}

export type HostRoomMessage = EnvelopesOf<MessageOriginType.HOST_ROOM, HostRoomPayloads>;
