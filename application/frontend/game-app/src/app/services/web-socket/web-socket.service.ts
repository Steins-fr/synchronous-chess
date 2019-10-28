import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

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

    public static readonly ERROR_MESSAGE_SOCKET_DOES_NOT_EXIST: string = 'Socket does not exist! Please call "connect(__url__)"';

    private webSocket: WebSocket;

    // Socket state observables
    private readonly _state: BehaviorSubject<SocketState> = new BehaviorSubject<SocketState>(SocketState.CONNECTING);
    public state: Observable<SocketState> = this._state.asObservable();

    private readonly _message: Subject<SocketPayload> = new Subject<SocketPayload>();
    public message: Observable<SocketPayload> = this._message.asObservable();

    public connect(webSocket: WebSocket): void {
        if (this.webSocket) {
            this.close();
        }

        this.webSocket = webSocket;
        this.webSocket.onopen = (): void => this.onStateChange();
        this.webSocket.onclose = (): void => this.onStateChange();
        this.webSocket.onmessage = (ev: MessageEvent): void => this.onMessage(ev);
    }

    public close(): void {
        this.checkSocketCreation();
        if (this.webSocket.readyState !== SocketState.CLOSED) {
            this.webSocket.close();
        }
    }

    public send(message: string, data: string): boolean {
        this.checkSocketCreation();
        if (this.webSocket.readyState === SocketState.OPEN) {
            const packet: string = JSON.stringify({ message, data });
            this.webSocket.send(packet);
            return true;
        }

        return false;
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

    private checkSocketCreation(): void {
        if (!this.webSocket) {
            throw new Error(WebSocketService.ERROR_MESSAGE_SOCKET_DOES_NOT_EXIST);
        }
    }
}
