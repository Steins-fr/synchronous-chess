import { Subject, Observable, Subscription } from 'rxjs';

import { Webrtc, WebrtcConnectionState } from '../webrtc/webrtc';
import WebrtcStates from '../webrtc/webrtc-states';
import { Message } from '../webrtc/messages/message';

export enum PlayerEventType {
    DISCONNECTED = 'disconnected',
    MESSAGE = 'message'
}

export interface PlayerEvent<T> {
    type: PlayerEventType;
    name: string; // Player name
    payload: T;
}

export class Player {

    private readonly subs: Array<Subscription> = [];
    private readonly _event: Subject<PlayerEvent<any>> = new Subject<PlayerEvent<any>>(); // TODO: other than any
    public readonly event: Observable<PlayerEvent<any>> = this._event.asObservable();
    public states?: Observable<WebrtcStates>; // For external debugging
    private connectionState: WebrtcConnectionState = WebrtcConnectionState.CONNECTED;

    public constructor(public readonly name: string, private readonly webRTC?: Webrtc) {
        if (this.isLocal() === false) {
            this.states = webRTC.states;
            this.subs.push(this.webRTC.states.subscribe((states: WebrtcStates) => this.onPeerStates(states)));
            this.subs.push(this.webRTC.data.subscribe((data: Message) => this.onPeerData(data)));
        }
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
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
        if (this.connectionState === states.iceConnection) {
            return; // Do nothing, it's the same state
        }
        this.connectionState = states.iceConnection as WebrtcConnectionState;

        if (this.connectionState === WebrtcConnectionState.DISCONNECTED) {
            this.pushEvent(PlayerEventType.DISCONNECTED);
        }
    }

    public sendData(message: Message): void {
        if (this.webRTC) {
            this.webRTC.sendMessage(message);
        }
    }

    public isLocal(): boolean {
        return this.webRTC === undefined;
    }

    private onPeerData(message: Message): void {
        this.pushEvent(PlayerEventType.MESSAGE, message);
    }
}
