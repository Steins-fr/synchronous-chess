import SignalNotification from '@app/services/room-api/notifications/signal-notification';
import { RtcSignal, Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import WebrtcStates from '@app/services/room-manager/classes/webrtc/webrtc-states';
import { Observable, Subject, Subscription } from 'rxjs';

export enum NegotiatorConnectionState {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected'
}

export abstract class Negotiator {

    private static readonly maxSignalTry: number = 3;
    private static readonly timeoutAfter: number = 15000;
    private readonly subs: Array<Subscription> = [];
    private iceConnectionState: RTCIceConnectionState = 'disconnected';
    private signalTry: number = 0;
    private timeoutId?: ReturnType<typeof setTimeout>;

    private readonly connectionStateSubject = new Subject<NegotiatorConnectionState>();
    public readonly connectionState$ = this.connectionStateSubject.asObservable();

    public readonly states: Observable<WebrtcStates>; // For external debugging
    public isInitiator: boolean = false;

    public constructor(public readonly playerName: string, public readonly webRTC: Webrtc) {
        this.states = webRTC.states;
        this.checkTimeout();
    }

    public async initiate(): Promise<void> {
        this.isInitiator = true;
        await this.setupConnection();
    }

    private checkTimeout(): void {
        this.timeoutId = setTimeout(() => {
            this.setConnectionState(NegotiatorConnectionState.DISCONNECTED);
            this.timeoutId = undefined;
        }, Negotiator.timeoutAfter);
    }

    protected async setupConnection(): Promise<void> {

        if (this.signalTry < Negotiator.maxSignalTry && this.iceConnectionState !== 'connected') {
            if (this.signalTry > 0) {
                console.error('Signal retry, may need debugging, if this error is not shown, remove signal retry logic');
            }
            this.subs.forEach((sub: Subscription) => sub.unsubscribe());
            this.webRTC.configure(this.isInitiator);

            this.subs.push(
                this.webRTC.rtcSignal$.subscribe((signal: RtcSignal) => this.onSignal(signal)),
                this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)),
            );

            if (this.isInitiator) {
                await this.webRTC.createOffer();
            }
        } else {
            this.setConnectionState(NegotiatorConnectionState.DISCONNECTED);
        }
    }

    protected setConnectionState(state: NegotiatorConnectionState): void {
        this.connectionStateSubject.next(state);
    }

    protected onPeerStates(states: WebrtcStates): void {
        if (this.iceConnectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }

        if (states.iceConnection === 'connected') {
            if (states.sendChannel !== 'open' || states.receiveChannel !== 'open') {
                return; // The channel is not ready yet
            }
            this.setConnectionState(NegotiatorConnectionState.CONNECTED);
        }

        this.iceConnectionState = states.iceConnection;
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
        this.connectionStateSubject.complete();
    }
}
