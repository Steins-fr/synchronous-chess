import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';

export enum SocketState {
    CONNECTING = WebSocket.CONNECTING,
    CLOSED = WebSocket.CLOSED,
    CLOSING = WebSocket.CLOSING,
    OPEN = WebSocket.OPEN
}

export interface SocketPayload {
    type: string;
    data: string;
}

@Injectable({
    providedIn: 'root'
})
export class WebSocketService {

    public static readonly ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP: string = 'Socket is not setup! Please call "setup(__url__)"';

    private webSocket: WebSocket;
    private _serverUrl: string = '';

    // Socket state observables
    private readonly _state: BehaviorSubject<SocketState> = new BehaviorSubject<SocketState>(SocketState.CONNECTING);
    public state: Observable<SocketState> = this._state.asObservable();

    private readonly _message: Subject<SocketPayload> = new Subject<SocketPayload>();
    public message: Observable<SocketPayload> = this._message.asObservable();

    public setup(serverUrl: string): void {
        this._serverUrl = serverUrl;
    }

    private createSocket(): WebSocket {
        return new WebSocket(this.serverUrl);
    }

    public connect(): void {
        if (this.webSocket) {
            this.close();
        }

        if (!this.serverUrl) {
            throw new Error(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
        }

        this.webSocket = this.createSocket();
        this.webSocket.onopen = (): void => this.onStateChange();
        this.webSocket.onclose = (): void => this.onStateChange();
        this.webSocket.onmessage = (ev: MessageEvent): void => this.onMessage(ev);
    }

    public close(): void {
        if (this.webSocket && this.webSocket.readyState !== SocketState.CLOSED) {
            this.webSocket.close();
        }
    }

    public send(message: string, data: string): void {
        if (!this.webSocket) {
            this.connect();
        }

        if (this.webSocket.readyState === SocketState.OPEN) {
            const packet: string = JSON.stringify({ message, data });
            this.webSocket.send(packet);
        } else {
            const sub: Subscription = this.state.subscribe((state: SocketState) => {
                if (state === SocketState.OPEN) {
                    this.send(message, data);
                    sub.unsubscribe();
                }
            });
        }
    }

    public get stateValue(): SocketState {
        return this._state.value;
    }

    public get socket(): WebSocket {
        return this.webSocket;
    }

    private onMessage(event: MessageEvent): void {
        this._message.next(JSON.parse(event.data));
    }

    private onStateChange(): void {
        this._state.next(this.webSocket.readyState);
    }

    public get serverUrl(): string {
        return this._serverUrl;
    }
}
