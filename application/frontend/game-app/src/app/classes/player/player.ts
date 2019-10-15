import { Webrtc, Signal, WebrtcStates } from '../webrtc/webrtc';
import { WebSocketService, SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { Subject, Observable, Subscription, BehaviorSubject } from 'rxjs';

export enum PlayerType {
    REMOTE_HOST = 'remote_host',
    REMOTE_PEER = 'remote_peer',
    LOCAL = 'local'
}

export enum PlayerEventType {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected'
}

export interface PlayerEvent {
    type: PlayerEventType;
    name: string; // Player name
    payload?: boolean;
}

export class Player {

    // Observables for data received from see player
    private readonly _data: Subject<any> = new Subject<any>();
    public data: Observable<any> = this._data.asObservable();
    private readonly subs: Array<Subscription> = [];
    private readonly socketSub: Subscription;
    public isConnected: boolean = false;
    public connectionTry: number = 0;
    private readonly _event: Subject<PlayerEvent> = new Subject<PlayerEvent>();
    public readonly event: Observable<PlayerEvent> = this._event.asObservable();

    public constructor(private readonly roomName: string, public readonly name: string, public readonly type: PlayerType, public readonly socket?: WebSocketService, public readonly webRTC?: Webrtc) {
        if (this.type !== PlayerType.LOCAL) {
            this.socketSub = this.socket.message.subscribe((payload: SocketPayload) => this.socketMessage(payload));
            if (this.isWebRtcInitiator()) {
                this.setupConnection();
            }
        }
    }

    private setupConnection(): void {

        if (this.connectionTry < 3 && this.isConnected === false) {
            this.subs.forEach((sub: Subscription) => sub.unsubscribe());
            this.webRTC.configure(this.isWebRtcInitiator());
            if (this.isWebRtcInitiator()) {
                this.webRTC.createOffer();
            }

            this.subs.push(this.webRTC.signal.subscribe((signal: Signal) => this.onSignal(signal)));
            this.subs.push(this.webRTC.data.subscribe((data: string) => this.onPeerData(data)));
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
        }
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        if (this.socketSub) {
            this.socketSub.unsubscribe();
        }
        if (this.webRTC) {
            this.webRTC.close();
        }
    }

    private pushEvent(type: PlayerEventType, payload?: boolean): void {
        this._event.next({
            type,
            payload,
            name: this.name
        });
    }

    private onPeerStates(states: WebrtcStates): void {
        if (states.iceConnection === 'checking' && this.isWebRtcInitiator()) {
            setTimeout(() => this.setupConnection(), 3000);
        }
        const oldIsConnected: boolean = this.isConnected;
        this.isConnected = states.iceConnection === 'connected';
        if (this.isConnected !== oldIsConnected) {
            this.pushEvent(this.isConnected ? PlayerEventType.CONNECTED : PlayerEventType.DISCONNECTED);
        }
    }

    private onSignal(signal: Signal): void {
        const signalPacket: any = {
            signal,
            to: this.name,
            roomName: this.roomName
        };
        this.socket.send('sendmessage', 'signal', JSON.stringify(signalPacket));
    }

    private isWebRtcInitiator(): boolean {
        return this.type === PlayerType.REMOTE_PEER;
    }

    private socketMessage(payload: SocketPayload): void {
        if (payload.type !== 'remoteSignal') {
            return;
        }

        const data: any = JSON.parse(payload.data);
        if (data.from !== this.name) {
            return;
        }

        if (this.isWebRtcInitiator() === false) {
            this.setupConnection(); // Start/Restart the connection for new signal.
        }
        this.connectionTry++;

        this.webRTC.registerSignal(data.signal);
    }


    public sendData(data: object): void {
        if (this.webRTC) {
            this.webRTC.sendMessage(JSON.stringify(data));
        }
    }

    private onPeerData(data: string): void {
        const d: any = JSON.parse(data);
        d.from = this.name;
        this._data.next(d);
    }
}
