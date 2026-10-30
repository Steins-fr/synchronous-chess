import { isTemporaryJoinError, joinRoom } from '@app/services/room-api/join-room';
import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessageType, NewPlayerPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import RoomJoinRequest from '@protocol/requests/room-join-request';
import RoomJoinResponse from '@protocol/responses/room-join-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { AsyncSubject, defaultIfEmpty, firstValueFrom, map, Observable, take } from 'rxjs';
import { Negotiator, NegotiatorConnectionState } from '../negotiator/negotiator';
import { WebrtcNegotiator } from '../negotiator/webrtc-negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomHosting } from './room-hosting';
import { JoinFailure, RejoinResult, RoomNetwork } from './room-network';

/**
 * What the player joins the room with, beside its name: the game of the page, the password of a private room, the
 * token the player created or joined the room with, to reconnect it or take it over, and the id of its browser
 */
export type RoomAccess = Pick<RoomJoinRequest, 'game' | 'password' | 'token' | 'browserId'>;

/** How a negotiation with the host ended: connected, or failed, the host refusing the player when its room is full */
interface HostNegotiation {
    connected: boolean;
    roomFull: boolean;
}

/**
 * The network of a participant of the room. The player creating the room hosts it, the others join it through the
 * host; the room agreeing its host left, the participant it elects takes it over
 */
export class PeerRoomNetwork extends RoomNetwork {
    /** The negotiations with the host failing in a row before the player gives up connecting to it */
    private static readonly JOIN_ATTEMPTS: number = 2;

    protected hostPlayer?: Player;
    /** Connecting to the host: joining the room through the socket, or negotiating with the host */
    private joining: boolean = false;
    /** Aborted once the network is cleared: the player stops joining the room */
    private readonly cleared: AbortController = new AbortController();
    private _hostName: string;
    private hosting?: RoomHosting;

    public get initiator(): boolean {
        return this.hosting !== undefined;
    }

    public get hostName(): string {
        return this._hostName;
    }

    /**
     * @param hostName the name of the local player when it created the room
     * @param access sent again each time the player joins the room again: a private room refuses a join without its password
     */
    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        localPlayerName: string,
        hostName: string,
        private readonly maxPlayer: number,
        private readonly access: RoomAccess,
    ) {
        super(roomApi, roomName, localPlayerName);
        this._hostName = hostName;

        if (hostName === localPlayerName) { // The socket created the room
            this.startHosting(true);
        } else {
            this.joining = true;
            this.negotiateWithHost(hostName).subscribe((negotiation: HostNegotiation) => void this.joinHost(negotiation));
        }
    }

    /** The first connection to the host: failing, the player gives the room up, it never was in it */
    private async joinHost(negotiation: HostNegotiation): Promise<void> {
        try {
            const failure: JoinFailure | undefined = await this.afterNegotiation(negotiation);

            if (failure !== undefined) {
                this.joinFailedSubject.next(failure);
            }
        } catch (e) {
            if (!this.cleared.signal.aborted) {
                console.error('PeerRoom: the room could not be joined again', e);
                this.joinFailedSubject.next(JoinFailure.HOST_UNREACHABLE);
            }
        } finally {
            this.joining = false;
        }
    }

    /**
     * Negotiates with the host through the socket
     * @returns how the negotiation ended, once it ended: a negotiator cleared with the network failed
     */
    private negotiateWithHost(hostName: string): Observable<HostNegotiation> {
        const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, hostName, new Webrtc(), this.roomSocketApi);
        const negotiation: AsyncSubject<HostNegotiation> = new AsyncSubject<HostNegotiation>();
        // Subscribed first: the network then clears the negotiator, completing its states
        negotiator.connectionState$.pipe(
            take(1),
            defaultIfEmpty(NegotiatorConnectionState.DISCONNECTED),
            map((state: NegotiatorConnectionState) => ({ connected: state === NegotiatorConnectionState.CONNECTED, roomFull: negotiator.roomFull })),
        ).subscribe(negotiation);
        this.addNegotiator(negotiator);

        return negotiation.asObservable();
    }

    /**
     * Negotiates with the host, then joins the room again through the socket once the negotiation failed
     * @see afterNegotiation
     */
    private async connectToHost(hostName: string, attempt: number = 1): Promise<JoinFailure | undefined> {
        return this.afterNegotiation(await firstValueFrom(this.negotiateWithHost(hostName)), attempt);
    }

    /**
     * Once the negotiation with the host failed, the player joins the room again through the socket, then negotiates
     * again, JOIN_ATTEMPTS negotiations at most
     * @returns why the player could not connect to the host, undefined once connected
     * @throws {Error} the error of the API refusing the join, or an AbortError once the network is cleared
     */
    private async afterNegotiation({ connected, roomFull }: HostNegotiation, attempt: number = 1): Promise<JoinFailure | undefined> {
        if (connected) {
            return undefined;
        }

        this.cleared.signal.throwIfAborted();

        if (roomFull) {
            return JoinFailure.ROOM_FULL;
        }

        if (attempt === PeerRoomNetwork.JOIN_ATTEMPTS) {
            return JoinFailure.HOST_UNREACHABLE;
        }

        // A lost connection may connect at the next attempt
        this.joiningAgainSubject.next();
        return this.connectToHost(await this.joinThroughSocket(), attempt + 1);
    }

    /**
     * Joins the room through a new socket: the API forgets the former join, waiting for the host with the former socket.
     * Its token spares it the password of a private room, and so the lock of the passwords caused by another client
     * @returns the name of the host
     * @throws {Error} the error of the API refusing the join, or an AbortError once the network is cleared
     */
    private async joinThroughSocket(): Promise<string> {
        this.roomSocketApi.close();

        const response: RoomJoinResponse = await joinRoom(this.roomSocketApi, { roomName: this.roomName, playerName: this.localPlayer.name, ...this.access }, {
            onRetry: (error: string) => this.joinDelayedSubject.next(error),
            signal: this.cleared.signal,
        });
        this.cleared.signal.throwIfAborted();
        this._hostName = response.playerName;
        return response.playerName;
    }

    private startHosting(holdsRoom: boolean): void {
        this.hostPlayer = undefined;
        this.hosting = new RoomHosting(this.hostingContext(this.maxPlayer, this.access.token), holdsRoom);
        this.hosting.roomLost$.subscribe(() => this.roomLostSubject.next());
    }

    /** Takes the room over when elected, connects to the joining players through the new host otherwise */
    public changeHost(hostName: string): void {
        if (this.hosting) { // Hosting already: the room only changes its host once this one leaves
            return;
        }

        this._hostName = hostName;

        if (hostName === this.localPlayer.name) {
            this.startHosting(false);
        } else {
            this.hostPlayer = this.players.get(hostName);
        }
    }

    public removeFromRoom(playerName: string): void {
        this.hosting?.removePlayer(playerName);
    }

    protected onPlayerConnected(player: Player): void {
        if (player.name === this.hostName) {
            this.hostPlayer = player;
        }

        this.hosting?.onPlayerConnected(player);
    }

    protected onPlayerDisconnected(player: Player): void {
        if (this.hostPlayer?.name === player.name) {
            this.hostPlayer = undefined;
        }
    }

    /** The signals relayed to this participant are negotiated by every network */
    protected onRoomMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.HOST_ROOM && message.type === HostRoomMessageType.NEW_PLAYER) {
            void this.onNewPlayer(message.payload);
        }
    }

    /**
     * Joins the room again through the socket, as on a reloaded page, then connects to the host: the API refuses the
     * name until the host removed the former connection, and while the host reconnects. The others connect to it again
     * once connected to the host. The host first closes the socket of its room: the participants it lost, still
     * connected to each other, take the room over, and the room waits for its host when they all left. Not connected to
     * the host, the participant stays in the room, to join it again later; refused by the host, its room full, the
     * participant gives it up: the room gave its place to another player
     */
    public override async rejoin(): Promise<RejoinResult> {
        if (this.joining || this.getNegotiatorSize() > 0) { // Connecting again already
            return RejoinResult.NOT_JOINED;
        }

        // The room it hosts is let go: the join closes its socket
        this.hosting?.clear();
        this.hosting = undefined;
        this.joining = true;

        try {
            return this.rejoinResult(await this.connectToHost(await this.joinThroughSocket()));
        } catch (e) {
            return this.rejoinFailure(e);
        } finally {
            this.joining = false;
        }
    }

    private rejoinResult(failure: JoinFailure | undefined): RejoinResult {
        if (failure === JoinFailure.ROOM_FULL) {
            this.joinFailedSubject.next(failure);
            return RejoinResult.ROOM_LOST;
        }

        return failure === undefined ? RejoinResult.JOINED : RejoinResult.NOT_JOINED;
    }

    private rejoinFailure(error: unknown): RejoinResult {
        if (this.cleared.signal.aborted) { // The player left the room
            return RejoinResult.NOT_JOINED;
        }

        if (error instanceof RoomApiError && error.message === RoomApiErrorMessage.HOST_DISCONNECTED) {
            return RejoinResult.HOST_LEFT;
        }

        console.error('PeerRoom: the room could not be joined again', error);

        if (error instanceof RoomApiError && !isTemporaryJoinError(error)) { // The room expired
            this.roomLostSubject.next();
            return RejoinResult.ROOM_LOST;
        }

        return RejoinResult.NOT_JOINED;
    }

    private async onNewPlayer(newPlayerPayload: NewPlayerPayload): Promise<void> {
        // I am notified that I joined the room => close the socket, unless it holds the room I host
        if (this.localPlayer.name === newPlayerPayload.playerName && !this.hosting) {
            this.roomSocketApi.close();
        }

        if (this.hostPlayer === undefined) { // Do nothing if we don't have a host for transmitting negotiations
            return;
        }

        if (this.isPlayerNameAlreadyInRoom(newPlayerPayload.playerName)) {
            return;
        }
        const negotiator: Negotiator = new WebrtcNegotiator(newPlayerPayload.playerName, new Webrtc(), this.hostPlayer);
        // Before initiating it: the network handles a failure meanwhile
        this.addNegotiator(negotiator);
        await negotiator.initiate();
    }

    public override clear(): void {
        this.cleared.abort();
        this.hosting?.clear();
        super.clear();
    }
}
