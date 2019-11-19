import { NegotiatorMessage, NegotiatorMessageType } from '../webrtc/messages/negotiator-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc, Signal } from '../webrtc/webrtc';

import { Negotiator } from './negotiator';
import { Player, PlayerType } from '../player/player';

export interface SignalPayload {
    to: string;
    signal: Signal;
}

export class WebrtcNegotiator extends Negotiator {

    public constructor(playerName: string, playerType: PlayerType, webRTC: Webrtc,
        private readonly peer: Player) {
        super(playerName, playerType, webRTC);
    }

    protected handleSignal(signal: Signal): void {
        const signalPayload: SignalPayload = {
            to: this.playerName,
            signal
        };

        const message: NegotiatorMessage<SignalPayload> = {
            type: NegotiatorMessageType.SIGNAL,
            payload: signalPayload,
            origin: MessageOriginType.NEGOTIATOR,
            from: this.playerName
        };

        this.peer.sendData(message);
    }
}
