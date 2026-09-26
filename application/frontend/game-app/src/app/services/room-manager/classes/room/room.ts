import { signal } from '@angular/core';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Observable, Subject, filter, takeUntil } from 'rxjs';
import { RoomNetwork } from '../room-network/room-network';
import { LocalPlayer } from '../player/local-player';
import { Player } from '../player/player';

export class Room<RoomServiceNotification extends RoomMessage> {
    public get localPlayer(): LocalPlayer {
        return this._roomConnection.localPlayer;
    }

    private readonly _players = signal<ReadonlyArray<Readonly<Player>>>([]);
    public readonly players = this._players.asReadonly();
    private readonly _queue = signal<ReadonlyArray<string>>([]);
    public readonly queue = this._queue.asReadonly();

    protected readonly publicMessenger$ = new Subject<RoomServiceNotification>();
    protected readonly destroyRef = new Subject<void>();

    public get roomConnection(): RoomNetwork<RoomMessage> {
        return this._roomConnection;
    }

    public constructor(
        protected readonly roomApi: RoomSocketApi,
        private readonly _roomConnection: RoomNetwork<RoomMessage>
    ) {
        this._players.set([this.localPlayer]);

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

    // FIXME: rework messenger to be strict typed
    public messenger(messageType: string[] | string): Observable<RoomServiceNotification> {
        return this.publicMessenger$.asObservable().pipe(filter((message: RoomServiceNotification) => {
            if (Array.isArray(messageType)) {
                return messageType.includes(message.type);
            }

            return message.type === messageType;
        }));
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

    public transmitMessage<T>(type: string, message: T): void {
        const roomServiceMessage: RoomMessage<string, T> = {
            from: this.localPlayer.name,
            type,
            payload: message,
            origin: MessageOriginType.ROOM_SERVICE
        };

        this._players().forEach((player: Readonly<Player>) => {
            player.sendData(roomServiceMessage);
        });
    }

    protected onMessage(message: RoomMessage): void {
        // TODO: rework this type
        this.publicMessenger$.next(message as RoomServiceNotification);
    }

    public get roomName(): string {
        return this._roomConnection.roomName;
    }

    protected handleRoomPlayerAdd(player: Player): void {
        this._players.update(players => players.filter(p => p.name !== player.name).concat(player));
    }

    protected handleRoomPlayerRemove(player: Player): void {
        this._players.update(players => players.filter(p => p.name !== player.name));
    }

    protected handleRoomQueueAdd(playerName: string): void {
        this._queue.update(queue => queue.concat(playerName));
    }

    protected handleRoomQueueRemove(playerName: string): void {
        this._queue.update(queue => queue.filter((name: string) => name !== playerName));
    }
}
