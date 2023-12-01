import { Subscription, Observable } from 'rxjs';

import WebrtcStates from '../webrtc/webrtc-states';
import { Webrtc, RtcSignal, WebrtcConnectionState } from '../webrtc/webrtc';

import SignalNotification from '../../services/room-api/notifications/signal-notification';
import { PlayerType } from '../player/player';
import Notifier, { NotifierFlow } from '../notifier/notifier';

export enum NegotiatorEventType {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected'
}

export interface NegotiatorEvent {
    playerName: string;
}

export abstract class Negotiator {

    private static readonly maxSignalTry: number = 3;
    private static readonly checkingTimeout: number = 3000;
    private static readonly timeoutAfter: number = 15000;
    private readonly subs: Array<Subscription> = [];
    private connectionState: WebrtcConnectionState = WebrtcConnectionState.DISCONNECTED;
    private signalTry: number = 0;
    private timeoutId?: ReturnType<typeof setTimeout>;

    private readonly _notifier: Notifier<NegotiatorEventType, NegotiatorEvent> = new Notifier<NegotiatorEventType, NegotiatorEvent>();

    public readonly states: Observable<WebrtcStates>; // For external debugging
    public isInitiator: boolean = false;

    public constructor(
        public readonly playerName: string,
        public readonly playerType: PlayerType,
        public readonly webRTC: Webrtc) {
        this.states = webRTC.states;
        this.checkTimeout();
    }

    public get notifier(): NotifierFlow<NegotiatorEventType> {
        return this._notifier;
    }

    public initiate(): void {
        this.isInitiator = true;
        this.setupConnection();
    }

    private checkTimeout(): void {
        this.timeoutId = setTimeout(() => {
            this.pushEvent(NegotiatorEventType.DISCONNECTED);
            this.timeoutId = undefined;
        }, Negotiator.timeoutAfter);
    }

    protected setupConnection(): void {

        if (this.signalTry < Negotiator.maxSignalTry && this.connectionState !== WebrtcConnectionState.CONNECTED) {
            this.subs.forEach((sub: Subscription) => sub.unsubscribe());
            this.webRTC.configure(this.isInitiator);
            if (this.isInitiator) {
                this.webRTC.createOffer();
            }

            this.subs.push(this.webRTC.rtcSignal$.subscribe((signal: RtcSignal) => this.onSignal(signal)));
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
        } else {
            this.pushEvent(NegotiatorEventType.DISCONNECTED);
        }
    }

    protected pushEvent(type: NegotiatorEventType): void {
        this._notifier.notify(type, {
            playerName: this.playerName
        });
    }

    protected onPeerStates(states: WebrtcStates): void {
        if (this.connectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }
        const newConnectionState = states.iceConnection as WebrtcConnectionState;

        switch (newConnectionState) {
            case WebrtcConnectionState.CHECKING:
                if (newConnectionState === states.iceConnection) {
                    break; // Do nothing, it's the same state
                }
                if (this.isInitiator) { // Timeout the connection temptation
                    setTimeout(() => this.setupConnection(), Negotiator.checkingTimeout);
                }
                break;
            case WebrtcConnectionState.CONNECTED:
                if (states.sendChannel as WebrtcConnectionState !== WebrtcConnectionState.OPEN || states.receiveChannel as WebrtcConnectionState !== WebrtcConnectionState.OPEN) {
                    break; // The channel is not ready yet
                }
                this.pushEvent(NegotiatorEventType.CONNECTED);
                break;
            case WebrtcConnectionState.DISCONNECTED:
                if (newConnectionState === states.iceConnection) {
                    break; // Do nothing, it's the same state
                }
                this.pushEvent(NegotiatorEventType.DISCONNECTED);
                break;
        }
    }

    protected onSignal(signal: RtcSignal): void {
        this.signalTry++;
        this.handleSignal(signal);
    }

    protected abstract handleSignal(signal: RtcSignal): void;

    public negotiationMessage(payload: SignalNotification): void {

        if (payload.from !== this.playerName) { // Because we are listening to the same socket as the other negotiator
            return;
        }

        if (!this.isInitiator) {
            this.setupConnection(); // Start/Restart the connection for new signal.
        }

        this.webRTC.registerSignal(payload.signal);
    }

    public clear(): void {
        if (this.timeoutId !== undefined) {
            clearTimeout(this.timeoutId);
        }
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
    }
}
