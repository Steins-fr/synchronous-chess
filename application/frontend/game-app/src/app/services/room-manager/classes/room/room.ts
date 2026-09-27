import { signal } from '@angular/core';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { ReceivedMessage } from '@app/services/room-manager/classes/webrtc/messages/network-message';
import { AppMessage, AppMessagesOf, RoomServiceMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Observable, Subject, filter, takeUntil } from 'rxjs';
import { RoomNetwork } from '../room-network/room-network';
import { LocalPlayer } from '../player/local-player';
import { Player } from '../player/player';

/**
 * @template M map of the application message types to their payload
 */
export class Room<M extends object> {
    public get localPlayer(): LocalPlayer {
        return this._roomConnection.localPlayer;
    }

    private readonly _players = signal<ReadonlyArray<Readonly<Player>>>([]);
    public readonly players = this._players.asReadonly();
    private readonly _queue = signal<ReadonlyArray<string>>([]);
    public readonly queue = this._queue.asReadonly();

    protected readonly publicMessenger$ = new Subject<AppMessage>();
    protected readonly destroyRef = new Subject<void>();

    public get roomConnection(): RoomNetwork {
        return this._roomConnection;
    }

    public constructor(
        protected readonly roomApi: RoomSocketApi,
        private readonly _roomConnection: RoomNetwork
    ) {
        this._players.set([this.localPlayer]);
        // Negotiators added before this room subscribed (e.g. the host, on a peer) have already been notified
        this._queue.set([...this._roomConnection.negotiators().keys()]);

        this._roomConnection.onMessage$.pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onMessage(message));
        this._roomConnection.playerAdded$.pipe(takeUntil(this.destroyRef)).subscribe((player) => this.handleRoomPlayerAdd(player));
        this._roomConnection.playerRemoved$.pipe(takeUntil(this.destroyRef)).subscribe((player) => this.handleRoomPlayerRemove(player));
        this._roomConnection.queueAdded$.pipe(takeUntil(this.destroyRef)).subscribe((playerName) => this.handleRoomQueueAdd(playerName));
        this._roomConnection.queueRemoved$.pipe(takeUntil(this.destroyRef)).subscribe((playerName) => this.handleRoomQueueRemove(playerName));
    }

    public clear(): void {
        this.destroyRef.next();
        this.destroyRef.complete();
        this._roomConnection.clear();

        this.roomApi.close();
    }

    // The payload is trusted to match its type, as peers run the same application
    public messenger<K extends keyof M & string>(messageType: K): Observable<AppMessagesOf<M, K>> {
        return this.publicMessenger$.asObservable().pipe(
            filter((message: AppMessage): message is AppMessagesOf<M, K> => message.type === messageType)
        );
    }

    public get playerAdded$(): Observable<Player> {
        return this._roomConnection.playerAdded$;
    }

    public get playerRemoved$(): Observable<Player> {
        return this._roomConnection.playerRemoved$;
    }

    public get initiator(): boolean {
        return this._roomConnection.initiator;
    }

    public transmitMessage<K extends keyof M & string>(type: K, payload: M[K]): void {
        const roomServiceMessage: RoomServiceMessage = {
            type,
            payload,
            origin: MessageOriginType.ROOM_SERVICE
        };

        this._players().forEach((player: Readonly<Player>) => {
            if (!player.isLocal) {
                player.sendData(roomServiceMessage);
            }
        });

        // The sender receives its own message, as BlockRoom does
        this.publicMessenger$.next({ from: this.localPlayer.name, type, payload });
    }

    protected onMessage(message: ReceivedMessage): void {
        if (message.origin === MessageOriginType.ROOM_SERVICE) {
            this.publicMessenger$.next(message);
        }
    }

    public get roomName(): string {
        return this._roomConnection.roomName;
    }

    public get hostName(): string {
        return this._roomConnection.hostName;
    }

    protected handleRoomPlayerAdd(player: Player): void {
        this._players.update(players => players.filter(p => p.name !== player.name).concat(player));
    }

    protected handleRoomPlayerRemove(player: Player): void {
        this._players.update(players => players.filter(p => p.name !== player.name));
    }

    protected handleRoomQueueAdd(playerName: string): void {
        this._queue.update(queue => queue.includes(playerName) ? queue : queue.concat(playerName));
    }

    protected handleRoomQueueRemove(playerName: string): void {
        this._queue.update(queue => queue.filter((name: string) => name !== playerName));
    }
}
