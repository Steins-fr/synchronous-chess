import { BehaviorSubject, Observable, Subject, filter, first } from 'rxjs';
import { switchExhaustivenessGuard } from '@app/helpers/switch-exhaustiveness-guard.helper';
import { RoomApiRoute } from '@protocol/room-api-route.enum';

// Values mirror the WebSocket readyState constants
export enum SocketState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

/** Sends the first messages of a new socket, before it replaces the current one */
export type SocketHandover = (send: <Data>(message: string, data: Data) => void) => Promise<void>;

export class WebSocketService {

    public static readonly ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP: string = 'Socket is not setup! Please call "setup(__url__)"';
    // API Gateway closes a connection without message, in either direction, for 10 minutes
    private static readonly PING_INTERVAL: number = 5 * 60_000;
    private static readonly PING_PACKET: string = JSON.stringify({ message: RoomApiRoute.PING });

    private webSocket: WebSocket | null = null;
    private readonly pings = new Map<WebSocket, ReturnType<typeof setInterval>>();
    // Pings the open socket, from keepAlive() until close()
    private keepingAlive: boolean = false;
    private _openedAt: number | undefined;
    // Counts the calls of close(): a replacement started before one is abandoned
    private closings: number = 0;
    private replacement: Promise<void> | null = null;

    private readonly _state: BehaviorSubject<SocketState> = new BehaviorSubject<SocketState>(SocketState.CLOSED);

    private readonly _message: Subject<string> = new Subject<string>();
    public readonly message: Observable<string> = this._message.asObservable();

    private readonly _closed: Subject<void> = new Subject<void>();
    /** The open socket closed without close(): by the server (API Gateway closes any connection after 2 hours) or the network */
    public readonly closed$: Observable<void> = this._closed.asObservable();

    public constructor(private readonly _serverUrl: string) {}

    /** When the current socket opened (Date.now()), undefined without an open socket */
    public get openedAt(): number | undefined {
        return this._openedAt;
    }

    /** Pings the open socket every 5 minutes, and the sockets replacing it, until close(): API Gateway closes it idle otherwise */
    public keepAlive(): void {
        this.keepingAlive = true;

        if (this.webSocket && this._state.getValue() === SocketState.OPEN) {
            this.startPing(this.webSocket);
        }
    }

    /** A socket whose messages the service emits, whatever socket is the current one */
    private openSocket(): WebSocket {
        if (!this._serverUrl) {
            throw new Error(WebSocketService.ERROR_MESSAGE_SOCKET_URL_IS_NOT_SETUP);
        }

        const webSocket = new WebSocket(this._serverUrl);
        webSocket.onmessage = (ev: MessageEvent): void => this._message.next(ev.data);
        return webSocket;
    }

    private createSocket(): WebSocket {
        const webSocket = this.openSocket();
        this.adopt(webSocket);
        return webSocket;
    }

    /** Makes the socket the current one: the state of the service follows it */
    private adopt(webSocket: WebSocket): void {
        this.webSocket = webSocket;
        webSocket.onopen = (): void => this.onOpen(webSocket);
        webSocket.onclose = (): void => {
            this.stopPing(webSocket);

            if (this.webSocket !== webSocket) { // Closed by close(), or replaced
                return;
            }

            const wasOpen: boolean = this._state.getValue() === SocketState.OPEN;
            this._openedAt = undefined;
            this._state.next(SocketState.CLOSED);

            if (wasOpen) {
                this._closed.next();
            }
        };
    }

    private onOpen(webSocket: WebSocket): void {
        this._openedAt = Date.now();

        if (this.keepingAlive) {
            this.startPing(webSocket);
        }

        this._state.next(SocketState.OPEN);
    }

    private startPing(webSocket: WebSocket): void {
        if (!this.pings.has(webSocket)) {
            this.pings.set(webSocket, setInterval(() => webSocket.send(WebSocketService.PING_PACKET), WebSocketService.PING_INTERVAL));
        }
    }

    private stopPing(webSocket: WebSocket): void {
        clearInterval(this.pings.get(webSocket));
        this.pings.delete(webSocket);
    }

    private closeSocket(webSocket: WebSocket): void {
        this.stopPing(webSocket);

        if (webSocket.readyState !== SocketState.CLOSED) {
            webSocket.close();
        }
    }

    private getOrCreateSocket(): WebSocket {
        let webSocket: WebSocket | null;
        const state: SocketState = this._state.getValue();

        switch (state) {
            case SocketState.CONNECTING:
            case SocketState.OPEN:
                webSocket = this.webSocket;
                break;
            case SocketState.CLOSED:
            case SocketState.CLOSING:
                webSocket = this.createSocket();
                this._state.next(SocketState.CONNECTING);
                break;
            default:
                return switchExhaustivenessGuard(state);
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

        this.getOrCreateSocket();

        return new Promise<WebSocket>((resolve, reject) => {
            this._state
                .pipe(
                    filter((state: SocketState) => state === SocketState.OPEN || state === SocketState.CLOSED),
                    first()
                )
                .subscribe((state: SocketState) => {
                    if (state === SocketState.OPEN) {
                        // The socket open now: the one being opened, or the one that replaced it meanwhile
                        resolve(this.webSocket as WebSocket);
                    } else { // Not close(): the socket failing to open does not stop keeping the next ones alive
                        reject(new Error('Socket connection failed'));
                    }
                });
        });
    }

    public close(): void {
        const webSocket: WebSocket | null = this.webSocket;
        this.webSocket = null;
        this.keepingAlive = false;
        this._openedAt = undefined;
        this.closings++;

        if (webSocket) {
            this.closeSocket(webSocket);
        }

        this._state.next(SocketState.CLOSED);
    }

    public async send<Data>(message: string, data: Data): Promise<Data> {
        // Not through the socket being replaced: the server may have moved the room to the new one already
        if (this.replacement) {
            await this.replacement.then(() => undefined, () => undefined);
        }

        const webSocket = await this.getConnection();

        const packet: string = JSON.stringify({ message, data });
        webSocket.send(packet);

        return data;
    }

    /**
     * Replaces the socket by a new one, which the handover sends its first messages through: the current socket keeps
     * receiving meanwhile, the messages sent wait for the replacement to end. The current socket closes once replaced,
     * the new one if the handover fails or close() ran meanwhile
     * @throws {Error} when the new socket does not open, or the error of the handover
     */
    public async replace(handover: SocketHandover): Promise<void> {
        const replacement: Promise<void> = this.replaceSocket(handover);
        this.replacement = replacement;

        try {
            await replacement;
        } finally {
            if (this.replacement === replacement) {
                this.replacement = null;
            }
        }
    }

    private async replaceSocket(handover: SocketHandover): Promise<void> {
        const closings: number = this.closings;
        const next: WebSocket = this.openSocket();

        await new Promise<void>((resolve, reject) => {
            next.onopen = (): void => resolve();
            next.onclose = (): void => reject(new Error('Socket connection failed'));
        });

        try {
            this.closedGuard(closings);
            await handover(<Data>(message: string, data: Data): void => next.send(JSON.stringify({ message, data })));
            this.closedGuard(closings);

            if (next.readyState !== SocketState.OPEN) { // Closed during the handover
                throw new Error('Socket connection failed');
            }
        } catch (e) {
            this.closeSocket(next);
            throw e;
        }

        const previous: WebSocket | null = this.webSocket;
        this.adopt(next);
        this.onOpen(next);

        if (previous) {
            this.closeSocket(previous);
        }
    }

    /** @throws {Error} when close() ran since the count of closings given */
    private closedGuard(closings: number): void {
        if (this.closings !== closings) {
            throw new Error('Socket closed during its replacement');
        }
    }
}
