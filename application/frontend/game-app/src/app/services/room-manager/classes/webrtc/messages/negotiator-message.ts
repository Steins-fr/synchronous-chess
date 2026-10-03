import { RtcSignal } from '@protocol/rtc-signal';
import { EnvelopesOf } from './envelope';
import MessageOriginType from './message-origin.types';

export enum NegotiatorMessageType {
    SIGNAL = 'signal'
}

export interface SignalPayload {
    to: string;
    signal: RtcSignal;
}

export interface NegotiatorPayloads {
    [NegotiatorMessageType.SIGNAL]: SignalPayload;
}

export type NegotiatorMessage = EnvelopesOf<MessageOriginType.NEGOTIATOR, NegotiatorPayloads>;
