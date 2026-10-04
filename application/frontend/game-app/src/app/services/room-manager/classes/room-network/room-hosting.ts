import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessage, HostRoomMessageType } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NetworkMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import JoinNotification from '@protocol/notifications/join-notification';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import { catchError, defer, EMPTY, exhaustMap, merge, Observable, retry, startWith, Subject, switchMap, takeUntil, tap, throwError, timer } from 'rxjs';
import { Negotiator } from '../negotiator/negotiator';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';

/** What the hosting reads and changes of the network of the room */
export interface HostingContext {
    readonly roomSocketApi: RoomSocketApi;
    readonly roomName: string;
    readonly localPlayerName: string;
    readonly maxPlayer: number;
    /** The token the player created or joined the room with */
    readonly token: string;
    /** The connected players, the local one included */
    players(): ReadonlyMap<string, Player>;
    /** The connected players and the ones negotiating */
    occupancy(): number;
    addNegotiator(negotiator: Negotiator): void;
    transmitMessage(message: NetworkMessage): void;
}

/**
 * What the host of a room does, with the room on the websocket API: it lets the players join, tells the others to
 * connect to them, and keeps the room on its socket. The player creating the room hosts it,
 * then the participant taking over once its host left the room.
 */
export class RoomHosting {
    /** API Gateway closes any connection after 2 hours: the room moves to a new socket before */
    private static readonly SOCKET_REPLACEMENT_DELAY: number = 100 * 60_000;
    private static readonly RECONNECTION_RETRY_DELAY: number = 5000;
    /** Retries for 10 minutes, as long as the API keeps the room of a disconnected host (RoomService.HOST_RECONNECTION_DELAY) */
    private static readonly RECONNECTION_RETRIES: number = 120;

    private readonly destroyRef = new Subject<void>();
    private readonly reconnectedSubject = new Subject<void>();
    private readonly roomLostSubject = new Subject<void>();
    /** The room could not move to a new socket: nobody can join it anymore */
    public readonly roomLost$ = this.roomLostSubject.asObservable();
    /** The players the room agreed left, to remove from the room on the API */
    private readonly departed = new Set<string>();

    /**
     * @param holdsRoom whether the socket holds the room already, as the one of the player creating it: the room of a
     * participant taking over moves to a new socket at once
     */
    public constructor(private readonly context: HostingContext, private holdsRoom: boolean) {
        this.roomSocketApi.notification$.pipe(takeUntil(this.destroyRef)).subscribe((notification) => {
            if (notification.type === RoomSocketApiNotificationEnum.JOIN_REQUEST) {
                void this.onJoinNotification(notification.data);
            }
        });
        this.roomSocketApi.keepAlive();
        this.keepRoomConnected();
    }

    private get roomSocketApi(): RoomSocketApi {
        return this.context.roomSocketApi;
    }

    /** Moves the room to a new socket before API Gateway closes the current one, or once it closed */
    private keepRoomConnected(): void {
        const replacementDue$ = this.reconnectedSubject.pipe(
            startWith(undefined),
            switchMap(() => timer(this.holdsRoom ? this.replacementDelay() : 0)),
        );
        const closed$ = this.roomSocketApi.closed$.pipe(tap(() => {
            this.holdsRoom = false;
        }));

        merge(replacementDue$, closed$).pipe(
            exhaustMap(() => this.reconnect()),
            takeUntil(this.roomLost$),
            takeUntil(this.destroyRef),
        ).subscribe();
    }

    /** From the opening of the socket, which may have served before the room (a refused creation): at once without socket */
    private replacementDelay(): number {
        const openedAt: number | undefined = this.roomSocketApi.socketOpenedAt;
        return openedAt === undefined ? 0 : Math.max(0, openedAt + RoomHosting.SOCKET_REPLACEMENT_DELAY - Date.now());
    }

    private reconnect(): Observable<void> {
        const { roomName, localPlayerName: playerName, token } = this.context;

        return defer(() => this.roomSocketApi.reconnect({ roomName, playerName, token })).pipe(
            retry({
                count: RoomHosting.RECONNECTION_RETRIES,
                delay: (error: unknown) => RoomHosting.isFinal(error) ? throwError(() => error) : timer(RoomHosting.RECONNECTION_RETRY_DELAY),
            }),
            // Not waited for: the new socket may close meanwhile, to reconnect again
            tap(() => {
                this.holdsRoom = true;
                this.reconnectedSubject.next();
                void this.synchronizePlayers();
            }),
            catchError((error: unknown) => {
                console.error('HostRoom: the room could not move to a new socket', error);
                this.roomLostSubject.next();
                return EMPTY;
            }),
        );
    }

    /**
     * The API refused the room: it expired, or another room took its name. Except for a participant taking over while
     * the connection of the former host is still open, until it closes
     */
    private static isFinal(error: unknown): boolean {
        return error instanceof RoomApiError && error.message !== RoomApiErrorMessage.HOST_CONNECTED;
    }

    /**
     * Tells the API the players of the room: the ones joining or leaving while the socket was closed never reached it,
     * and the former host is removed after a takeover. The players lost but not agreed left stay in the room
     */
    private async synchronizePlayers(): Promise<void> {
        try {
            const roomName: string = this.context.roomName;
            const players: ReadonlyMap<string, Player> = this.context.players();
            const serverPlayers: string[] = (await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName })).players;
            const missingPlayers: string[] = [...players.keys()].filter((playerName: string) => !serverPlayers.includes(playerName));
            const playersToRemove: string[] = serverPlayers.filter((playerName: string) => this.departed.has(playerName));

            for (const playerName of missingPlayers) {
                // eslint-disable-next-line no-await-in-loop -- one update of the room at a time on the API
                await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName, playerName });
            }

            for (const playerName of playersToRemove) {
                // eslint-disable-next-line no-await-in-loop -- the API removes a player by its index in the room: two removals at a time could remove the wrong one
                await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName, playerName });
            }
        } catch (e) {
            console.error(e);
        }
    }

    private async onJoinNotification(data: JoinNotification): Promise<void> {
        const { roomName } = this.context;

        if (this.context.occupancy() >= this.context.maxPlayer) {
            this.roomSocketApi
                .send(RoomApiRequestTypeEnum.FULL, { to: data.playerName, roomName })
                .catch((err: string) => console.error(err));
        } else {
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(roomName, data.playerName, new Webrtc(), this.roomSocketApi);
            await negotiator.initiate();
            this.context.addNegotiator(negotiator);
        }
    }

    /**
     * Declares the player to the API, and tells the remote players, the new one included, it connected: the others
     * connect to it, the host relaying their signals, and the new player closes its socket
     */
    public onPlayerConnected(player: Player): void {
        this.departed.delete(player.name);
        void this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: this.context.roomName, playerName: player.name });

        const message: HostRoomMessage = {
            type: HostRoomMessageType.NEW_PLAYER,
            payload: { playerName: player.name },
            origin: MessageOriginType.HOST_ROOM,
        };
        this.context.transmitMessage(message);
    }

    /**
     * Removes the player the room agreed left, not the one whose connection is only lost: it may take the room over.
     * Once the room moved to a new socket when the current one does not hold it
     */
    public removePlayer(playerName: string): void {
        this.departed.add(playerName);

        if (this.holdsRoom) {
            this.roomSocketApi
                .send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: this.context.roomName, playerName })
                .catch((err: unknown) => console.error(err));
        }
    }

    public clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.reconnectedSubject.complete();
        this.roomLostSubject.complete();
    }
}
