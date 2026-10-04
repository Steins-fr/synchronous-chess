import { RoomApiError, RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { HostRoomMessage, HostRoomMessageType, RemoteSignalPayload } from '@app/services/room-manager/classes/webrtc/messages/host-room-message';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { NegotiatorMessageType } from '@app/services/room-manager/classes/webrtc/messages/negotiator-message';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { Webrtc } from '@app/services/room-manager/classes/webrtc/webrtc';
import JoinNotification from '@protocol/notifications/join-notification';
import { isRtcSignal } from '@protocol/rtc-signal';
import { RoomApiRequestTypeEnum, RoomSocketApiNotificationEnum } from '@protocol/socket-packet-payload.type';
import { catchError, defer, EMPTY, exhaustMap, merge, Observable, retry, startWith, Subject, switchMap, takeUntil, tap, throwError, timer } from 'rxjs';
import { WebsocketNegotiator } from '../negotiator/websocket-negotiator';
import { Player } from '../player/player';
import { RoomNetwork } from './room-network';

export class HostRoomNetwork extends RoomNetwork {
    /** API Gateway closes any connection after 2 hours: the room moves to a new socket before */
    private static readonly SOCKET_REPLACEMENT_DELAY: number = 100 * 60_000;
    private static readonly RECONNECTION_RETRY_DELAY: number = 5000;
    /** Retries for 10 minutes, as long as the API keeps the room of a disconnected host (RoomService.HOST_RECONNECTION_DELAY) */
    private static readonly RECONNECTION_RETRIES: number = 120;

    public readonly initiator: boolean = true;

    public get hostName(): string {
        return this.localPlayer.name;
    }

    private destroyRef = new Subject<void>();
    private readonly reconnectedSubject = new Subject<void>();
    private readonly roomLostSubject = new Subject<void>();
    /** The room could not move to a new socket: nobody can join it anymore */
    public readonly roomLost$ = this.roomLostSubject.asObservable();

    public constructor(
        roomApi: RoomSocketApi,
        roomName: string,
        private readonly maxPlayer: number,
        localPlayerName: string,
        private readonly hostToken: string,
    ) {
        super(roomApi, roomName, localPlayerName);
        this.roomSocketApi.notification$.pipe(takeUntil(this.destroyRef)).subscribe((notification) => {
            if (notification.type === RoomSocketApiNotificationEnum.JOIN_REQUEST) {
                void this.onJoinNotification(notification.data);
            }
        });
        this.roomSocketApi.keepAlive();
        this.keepRoomConnected();
    }

    /** Moves the room to a new socket before API Gateway closes the current one, or once it closed */
    private keepRoomConnected(): void {
        const replacementDue$ = this.reconnectedSubject.pipe(
            startWith(undefined),
            switchMap(() => timer(this.replacementDelay())),
        );

        merge(replacementDue$, this.roomSocketApi.closed$).pipe(
            exhaustMap(() => this.reconnect()),
            takeUntil(this.roomLost$),
            takeUntil(this.destroyRef),
        ).subscribe();
    }

    /** From the opening of the socket, which may have served before the room (a refused creation): at once without socket */
    private replacementDelay(): number {
        const openedAt: number | undefined = this.roomSocketApi.socketOpenedAt;
        return openedAt === undefined ? 0 : Math.max(0, openedAt + HostRoomNetwork.SOCKET_REPLACEMENT_DELAY - Date.now());
    }

    private reconnect(): Observable<void> {
        return defer(() => this.roomSocketApi.reconnect({ roomName: this.roomName, hostToken: this.hostToken })).pipe(
            retry({
                count: HostRoomNetwork.RECONNECTION_RETRIES,
                // Unless the API refused it: the room expired, or another room took its name
                delay: (error: unknown) => error instanceof RoomApiError ? throwError(() => error) : timer(HostRoomNetwork.RECONNECTION_RETRY_DELAY),
            }),
            // Not waited for: the new socket may close meanwhile, to reconnect again
            tap(() => {
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

    /** The players joining or leaving while the socket was closed never reached the API: tells it the players of the room */
    private async synchronizePlayers(): Promise<void> {
        try {
            const roomName: string = this.roomName;
            const serverPlayers: string[] = (await this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_GET_ALL, { roomName })).players;
            const localPlayers: ReadonlySet<string> = new Set(this.players.keys());
            const missingPlayers: string[] = [];
            const playersToRemove: string[] = [];

            // Check if the server has less players than the local
            for (const player of this.players.values()) {
                if (!serverPlayers.includes(player.name)) {
                    missingPlayers.push(player.name);
                }
            }

            // Check if the server has more players than the local
            for (const playerName of serverPlayers) {
                if (!localPlayers.has(playerName)) {
                    playersToRemove.push(playerName);
                }
            }

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
        const nbPlayers: number = this.players.size + this.getNegotiatorSize();
        if (nbPlayers >= this.maxPlayer) {
            this.roomSocketApi
                .send(RoomApiRequestTypeEnum.FULL, { to: data.playerName, roomName: this.roomName })
                .catch((err: string) => console.error(err));
        } else {
            const negotiator: WebsocketNegotiator = new WebsocketNegotiator(this.roomName, data.playerName, new Webrtc(), this.roomSocketApi);
            await negotiator.initiate();
            this.addNegotiator(negotiator);
        }
    }

    protected transmitNewPlayer(playerName: string): void {
        const message: HostRoomMessage = {
            type: HostRoomMessageType.NEW_PLAYER,
            payload: { playerName },
            origin: MessageOriginType.HOST_ROOM,
        };

        this.transmitMessage(message);
    }

    protected onPlayerConnected(player: Player): void {
        void this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_ADD, { roomName: this.roomName, playerName: player.name });
    }

    protected onPlayerDisconnected(player: Player): void {
        void this.roomSocketApi.send(RoomApiRequestTypeEnum.PLAYER_REMOVE, { roomName: this.roomName, playerName: player.name });
    }

    protected onRoomMessage(message: ReceivedMessage): void {
        if (message.origin !== MessageOriginType.NEGOTIATOR) {
            console.warn('HostRoom: no message', message);
            return;
        }
        console.warn('HostRoom: onRoomMessage', message);

        if (message.type === NegotiatorMessageType.SIGNAL) {
            const player: Player | undefined = this.players.get(message.payload.to);

            if (!player) {
                return;
            }

            if (!isRtcSignal(message.payload.signal)) { // Do not relay what the other peer could not register
                console.error('HostRoom: invalid signal not relayed', message);
                return;
            }

            const remoteSignalPayload: RemoteSignalPayload = {
                from: message.from,
                signal: message.payload.signal
            };

            const negotiationMessage: HostRoomMessage = {
                type: HostRoomMessageType.REMOTE_SIGNAL,
                payload: remoteSignalPayload,
                origin: MessageOriginType.HOST_ROOM,
            };

            player.sendData(negotiationMessage);
        }
    }

    public override clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this.destroyRef = new Subject<void>();
        this.reconnectedSubject.complete();
        this.roomLostSubject.complete();
        super.clear();
    }
}
