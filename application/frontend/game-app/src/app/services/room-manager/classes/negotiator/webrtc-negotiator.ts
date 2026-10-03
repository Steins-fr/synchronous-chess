import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessage, NegotiatorMessageType, SignalPayload } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import { RtcSignal } from '@protocol/rtc-signal';
import { Player } from '../player/player';
import { Negotiator } from './negotiator';

export class WebrtcNegotiator extends Negotiator {

    public constructor(playerName: string, webRTC: Webrtc, private readonly peer: Player) {
        super(playerName, webRTC);
    }

    protected handleSignal(signal: RtcSignal): void {
        const signalPayload: SignalPayload = {
            to: this.playerName,
            signal
        };

        const message: NegotiatorMessage = {
            type: NegotiatorMessageType.SIGNAL,
            payload: signalPayload,
            origin: MessageOriginType.NEGOTIATOR,
        };

        this.peer.sendData(message);
    }
}
