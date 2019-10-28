import { RoomMessage } from './room-message';

export enum NegotiatorMessageType {
    SIGNAL = 'signal',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface NegotiatorMessage extends RoomMessage {
    type: NegotiatorMessageType;
}
