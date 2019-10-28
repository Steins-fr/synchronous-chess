import { NegotiatorMessage, NegotiatorMessageType } from '../webrtc/messages/negotiator-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc, Signal } from '../webrtc/webrtc';

import { Negotiator } from './negotiator';
import { Player } from '../player/player';

export interface SignalPayload {
    to: string;
    signal: Signal;
}

export class WebrtcNegotiator extends Negotiator {

    public constructor(roomName: string, playerName: string, webRTC: Webrtc,
        private readonly peer: Player) {
        super(roomName, playerName, webRTC);
    }

    protected handleSignal(signal: Signal): void {
        const signalPayload: SignalPayload = {
            to: this.playerName,
            signal
        };

        const message: NegotiatorMessage = {
            type: NegotiatorMessageType.SIGNAL,
            payload: JSON.stringify(signalPayload),
            origin: MessageOriginType.NEGOTIATOR,
            from: this.playerName
        };

        this.peer.sendData(message);
    }
}
