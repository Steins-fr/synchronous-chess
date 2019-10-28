import { Webrtc, Signal } from '../webrtc/webrtc';
import { WebSocketService, SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { Subject, Observable, Subscription, BehaviorSubject } from 'rxjs';
import WebrtcStates from '../webrtc/webrtc-states';

export enum PlayerType {
    PEER_ANSWER = 'remote_host',
    PEER_OFFER = 'remote_peer',
    LOCAL = 'local'
}

export enum PlayerEventType {
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected',
    MESSAGE = 'message',
    //NEGOTIATION = 'negotiation'
}

export enum PlayerMessageType {
    CHAT = 'chat', // TO REMOVE
    NEW_PLAYER = 'newPlayer',
    SIGNAL = 'signal',
    REMOTE_SIGNAL = 'remoteSignal'
    //PARTICIPANTS = 'participants',
    //NEGOTIATION = 'negotiation'
}

export interface PlayerEvent<T> {
    type: PlayerEventType;
    name: string; // Player name
    payload: T;
}

export interface NewPlayerPayload {
    playerName: string;
}

export interface SignalPayload {
    to: string;
    signal: Signal;
}

export interface RemoteSignalPayload {
    from: string;
    signal: Signal;
}

export interface PlayerMessage {
    type: PlayerMessageType;
    payload: string;
    isPrivate: boolean;
    from: string;
}

export interface RemoteSignalMessage {
    type: string;
    data: string;
}

export class Player {

    private readonly subs: Array<Subscription> = [];
    private negotiationSub: Subscription;
    public isConnected: boolean = false;
    private signalTry: number = 0;
    private readonly _event: Subject<PlayerEvent<any>> = new Subject<PlayerEvent<any>>(); // TODO: other than any
    public readonly event: Observable<PlayerEvent<any>> = this._event.asObservable();
    private socket?: WebSocketService;
    private peer?: Player;
    private webRTC?: Webrtc;
    public states?: Observable<WebrtcStates>; // For external debugging

    public constructor(private readonly roomName: string, public readonly name: string, public readonly type: PlayerType) { }

    public negotiateBySocket(webRTC: Webrtc, socket: WebSocketService): void {
        if (this.type !== PlayerType.LOCAL) {
            this.webRTC = webRTC;
            this.states = webRTC.states;
            this.socket = socket;
            this.negotiationSub = this.socket.message.subscribe((payload: SocketPayload) => this.negotiationMessage(payload));
            if (this.isWebRtcInitiator()) {
                this.setupConnection();
            }
        }
    }

    public negotiateByPeer(webRTC: Webrtc, peer: Player): void {
        if (this.type !== PlayerType.LOCAL) {
            this.webRTC = webRTC;
            this.states = webRTC.states;
            this.peer = peer;
            if (this.isWebRtcInitiator()) {
                this.setupConnection();
            }
        }
    }

    private setupConnection(): void {

        if (this.signalTry < 3 && this.isConnected === false) {
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
        if (this.negotiationSub) {
            this.negotiationSub.unsubscribe();
        }
        if (this.webRTC) {
            this.webRTC.close();
        }
    }

    private pushEvent(type: PlayerEventType, payload?: any): void {
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
            const eventType: PlayerEventType = this.isConnected ? PlayerEventType.CONNECTED : PlayerEventType.DISCONNECTED;
            setTimeout(() => this.pushEvent(eventType), 100);
        }
    }

    private onSignal(signal: Signal): void {
        const signalPacket: any = { // TODO: type
            signal,
            to: this.name,
            roomName: this.roomName
        };

        this.signalTry++;

        if (this.socket !== undefined) {
            this.socket.send('sendmessage', 'signal', JSON.stringify(signalPacket));
        } else if (this.peer !== undefined) {
            const signalPayload: SignalPayload = {
                to: this.name,
                signal
            };

            this.peer.sendData({
                type: PlayerMessageType.SIGNAL,
                payload: JSON.stringify(signalPayload),
                isPrivate: true,
                from: this.name
            });
        }
    }

    private isWebRtcInitiator(): boolean {
        return this.type === PlayerType.PEER_OFFER;
    }

    public negotiationMessage(remoteSignalMessage: RemoteSignalMessage): void {
        if (remoteSignalMessage.type !== 'remoteSignal') {
            return;
        }

        const remoteSignalPayload: RemoteSignalPayload = JSON.parse(remoteSignalMessage.data);
        if (remoteSignalPayload.from !== this.name) {
            return;
        }

        if (this.isWebRtcInitiator() === false) {
            this.setupConnection(); // Start/Restart the connection for new signal.
        }

        this.webRTC.registerSignal(remoteSignalPayload.signal);
    }


    public sendData(data: PlayerMessage): void {
        if (this.webRTC) {
            this.webRTC.sendMessage(JSON.stringify(data));
        }
    }

    private onPeerData(data: string): void {
        const message: PlayerMessage = JSON.parse(data);
        this.pushEvent(PlayerEventType.MESSAGE, message);
    }
}
