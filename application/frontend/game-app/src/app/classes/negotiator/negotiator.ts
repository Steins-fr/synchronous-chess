import { Subscription, Subject, Observable } from 'rxjs';

import WebrtcStates from '../webrtc/webrtc-states';
import { Webrtc, Signal, WebrtcConnectionState } from '../webrtc/webrtc';

import SignalNotification from 'src/app/services/room-api/notifications/signal-notification';

export enum NegotiatorEventType {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected'
}

export interface NegotiatorEvent {
    type: NegotiatorEventType;
    playerName: string;
}

export abstract class Negotiator {
    private readonly subs: Array<Subscription> = [];
    private connectionState: WebrtcConnectionState = WebrtcConnectionState.DISCONNECTED;
    private signalTry: number = 0;
    private readonly _event: Subject<NegotiatorEvent> = new Subject<NegotiatorEvent>();
    public readonly event: Observable<NegotiatorEvent> = this._event.asObservable();
    public states?: Observable<WebrtcStates>; // For external debugging
    public isInitiator: boolean = false;

    public constructor(
        protected readonly roomName: string,
        public readonly playerName: string,
        public readonly webRTC: Webrtc) {
        this.states = webRTC.states;
    }

    public initiate(): void {
        this.isInitiator = true;
        this.setupConnection();
    }

    protected setupConnection(): void {

        if (this.signalTry < 3 && this.connectionState !== WebrtcConnectionState.CONNECTED) {
            this.subs.forEach((sub: Subscription) => sub.unsubscribe());
            this.webRTC.configure(this.isInitiator);
            if (this.isInitiator) {
                this.webRTC.createOffer();
            }

            this.subs.push(this.webRTC.signal.subscribe((signal: Signal) => this.onSignal(signal)));
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
        }
    }

    protected pushEvent(type: NegotiatorEventType): void {
        this._event.next({
            type,
            playerName: this.playerName
        });
    }

    protected onPeerStates(states: WebrtcStates): void {
        if (this.connectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }
        this.connectionState = states.iceConnection as WebrtcConnectionState;

        switch (this.connectionState) {
            case WebrtcConnectionState.CHECKING:
                if (this.isInitiator) { // Timeout the connection temptation
                    setTimeout(() => this.setupConnection(), 3000);
                }
                break;
            case WebrtcConnectionState.CONNECTED:
                setTimeout(() => this.pushEvent(NegotiatorEventType.CONNECTED), 100);
                break;
            case WebrtcConnectionState.DISCONNECTED:
                this.pushEvent(NegotiatorEventType.DISCONNECTED);

        }
    }

    protected onSignal(signal: Signal): void {
        this.signalTry++;
        this.handleSignal(signal);
    }

    protected abstract handleSignal(signal: Signal): void;

    public negotiationMessage(payload: SignalNotification): void {

        if (payload.from !== this.playerName) { // Because we are listening to the same socket as the other negotiator
            return;
        }

        if (this.isInitiator === false) {
            this.setupConnection(); // Start/Restart the connection for new signal.
        }

        this.webRTC.registerSignal(payload.signal);
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
    }
}
