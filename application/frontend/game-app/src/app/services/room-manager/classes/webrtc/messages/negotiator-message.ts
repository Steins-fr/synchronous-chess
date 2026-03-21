import { ToReworkMessage } from './to-rework-message';

export enum NegotiatorMessageType {
    SIGNAL = 'signal',
    REMOTE_SIGNAL = 'remoteSignal'
}

export interface NegotiatorMessage<U> extends ToReworkMessage<U> {
    type: NegotiatorMessageType;
}
