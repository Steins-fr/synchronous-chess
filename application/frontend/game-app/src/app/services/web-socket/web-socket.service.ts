import { BehaviorSubject, Observable, Subject, filter, first } from 'rxjs';

export enum SocketState {
    CONNECTING = WebSocket.CONNECTING,
    OPEN = WebSocket.OPEN,
    CLOSED = WebSocket.CLOSED,
    CLOSING = WebSocket.CLOSING,
}

export class WebSocketService {

    public static readonly ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP: string = 'Socket is not setup! Please call "setup(__url__)"';

    private webSocket: WebSocket | null = null;

    private readonly _state: BehaviorSubject<SocketState> = new BehaviorSubject<SocketState>(SocketState.CLOSED);

    private readonly _message: Subject<string> = new Subject<string>();
    public readonly message: Observable<string> = this._message.asObservable();

    public constructor(private readonly _serverUrl: string) {}

    private createSocket(): WebSocket {
        if (!this._serverUrl) {
            throw new Error(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
        }

        const webSocket = new WebSocket(this._serverUrl);
        this.webSocket = webSocket;
        webSocket.onopen = (): void => this._state.next(webSocket.readyState);
        webSocket.onclose = (): void => this._state.next(webSocket.readyState);
        webSocket.onmessage = (ev: MessageEvent): void => this._message.next(ev.data);
        return webSocket;
    }

    private getOrCreateSocket(): WebSocket {
        if (this._state.getValue() === SocketState.OPEN && this.webSocket) {
            return this.webSocket;
        }

        let webSocket: WebSocket | null = null;

        switch (this._state.getValue()) {
            case SocketState.CONNECTING:
                webSocket = this.webSocket;
                break;
            case SocketState.CLOSED:
            case SocketState.CLOSING:
                webSocket = this.createSocket();
                this._state.next(SocketState.CONNECTING);
                break;
            default:
                throw new Error('Should not happen');
        }

        if (!webSocket) {
            throw new Error('Socket connection failed');
        }

        return webSocket;
    }

    private async getConnection(): Promise<WebSocket> {
        if (this._state.getValue() === SocketState.OPEN && this.webSocket) {
            return this.webSocket;
        }

        const webSocket = this.getOrCreateSocket();

        return new Promise<WebSocket>((resolve, reject) => {
            this._state
                .pipe(
                    filter((state: SocketState) => state === SocketState.OPEN || state === SocketState.CLOSED),
                    first()
                )
                .subscribe((state: SocketState) => {
                    if (state === SocketState.OPEN) {
                        resolve(webSocket);
                    } else if (state === SocketState.CLOSED) {
                        this.close();
                        reject(new Error('Socket connection failed'));
                    }
                });
        });
    }

    public close(): void {
        if (this.webSocket && this.webSocket.readyState !== SocketState.CLOSED) {
            this.webSocket.close();
        }

        this.webSocket = null;
    }

    public async send<Data>(message: string, data: Data): Promise<Data> {
        const webSocket = await this.getConnection();

        const packet: string = JSON.stringify({ message, data });
        webSocket.send(packet);

        return data;
    }
}
