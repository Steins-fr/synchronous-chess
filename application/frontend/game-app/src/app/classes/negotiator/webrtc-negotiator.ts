import { NegotiatorMessage, NegotiatorMessageType } from '../webrtc/messages/negotiator-message';
import MessageOriginType from '../webrtc/messages/message-origin.types';
import { Webrtc, RtcSignal } from '../webrtc/webrtc';

import { Negotiator } from './negotiator';
import { Player, PlayerType } from '../player/player';

export interface SignalPayload {
    to: string;
    signal: RtcSignal;
}

export class WebrtcNegotiator extends Negotiator {

    public constructor(playerName: string, playerType: PlayerType, webRTC: Webrtc,
        private readonly peer: Player) {
        super(playerName, playerType, webRTC);
    }

    protected handleSignal(signal: RtcSignal): void {
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

        // FIXME: send webrtc negotiator, why ???

        this.peer.sendData(message);
    }
}
