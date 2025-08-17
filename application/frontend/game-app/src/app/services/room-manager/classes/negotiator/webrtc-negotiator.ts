import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessage, NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { RtcSignal, Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { Negotiator } from './negotiator';
import { PlayerType, Player } from '../player/player';

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
