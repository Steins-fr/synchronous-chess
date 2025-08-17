import { Webrtc, RtcSignal } from '@app/services/room-manager/classes/webrtc/webrtc';
import WebrtcStates from '@app/services/room-manager/classes/webrtc/webrtc-states';
import Notifier, { NotifierFlow } from '@app/deprecated/notifier/notifier';
import SignalNotification from '@app/services/room-api/notifications/signal-notification';
import { Subscription, Observable } from 'rxjs';
import { PlayerType } from '../player/player';

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
    private connectionState: RTCIceConnectionState = 'disconnected';
    private signalTry: number = 0;
    private timeoutId?: ReturnType<typeof setTimeout>;

    private readonly _notifier: Notifier<NegotiatorEventType, NegotiatorEvent> = new Notifier<NegotiatorEventType, NegotiatorEvent>();

    public readonly states: Observable<WebrtcStates>; // For external debugging
    public isInitiator: boolean = false;

    public constructor(
        public readonly playerName: string,
        // FIXME: see how playerType is used
        public readonly playerType: PlayerType,
        public readonly webRTC: Webrtc) {
        this.states = webRTC.states;
        this.checkTimeout();
    }

    public get notifier(): NotifierFlow<NegotiatorEventType> {
        return this._notifier;
    }

    public async initiate(): Promise<void> {
        this.isInitiator = true;
        await this.setupConnection();
    }

    private checkTimeout(): void {
        this.timeoutId = setTimeout(() => {
            this.pushEvent(NegotiatorEventType.DISCONNECTED);
            this.timeoutId = undefined;
        }, Negotiator.timeoutAfter);
    }

    protected async setupConnection(): Promise<void> {

        // FIXME: rework this
        if (this.signalTry < Negotiator.maxSignalTry && this.connectionState !== 'connected') {
            this.subs.forEach((sub: Subscription) => sub.unsubscribe());
            this.webRTC.configure(this.isInitiator);

            this.subs.push(this.webRTC.rtcSignal$.subscribe((signal: RtcSignal) => this.onSignal(signal)));
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));

            if (this.isInitiator) {
                await this.webRTC.createOffer();
            }
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
        const newConnectionState = states.iceConnection;

        switch (newConnectionState) {
            case 'checking':
                if (newConnectionState === states.iceConnection) {
                    break; // Do nothing, it's the same state
                }
                if (this.isInitiator) { // Timeout the connection temptation
                    setTimeout(() => this.setupConnection(), Negotiator.checkingTimeout);
                }
                break;
            case 'connected':
                if (states.sendChannel !== 'open' || states.receiveChannel !== 'open') {
                    return; // The channel is not ready yet
                }
                this.pushEvent(NegotiatorEventType.CONNECTED);
                break;
            case 'disconnected':
                if (newConnectionState === states.iceConnection) {
                    break; // Do nothing, it's the same state
                }
                this.pushEvent(NegotiatorEventType.DISCONNECTED);
                break;
        }

        this.connectionState = newConnectionState;
    }

    protected onSignal(signal: RtcSignal): void {
        console.warn('Negotiator received signal', signal);
        this.signalTry++;
        this.handleSignal(signal);
    }

    protected abstract handleSignal(signal: RtcSignal): void;

    public async negotiationMessage(payload: SignalNotification): Promise<void> {

        if (payload.from !== this.playerName) { // Because we are listening to the same socket as the other negotiator
            return;
        }

        if (!this.isInitiator) {
            await this.setupConnection(); // Start/Restart the connection for new signal.
        }

        await this.webRTC.registerSignal(payload.signal);
    }

    public clear(): void {
        if (this.timeoutId !== undefined) {
            clearTimeout(this.timeoutId);
        }
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
    }
}
