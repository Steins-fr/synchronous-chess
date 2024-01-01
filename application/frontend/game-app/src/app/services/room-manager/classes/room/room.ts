import { NgZone } from '@angular/core';
import { NotifierFlow } from '@app/classes/notifier/notifier';
import { LocalPlayer } from '@app/classes/player/local-player';
import { Player } from '@app/classes/player/player';
import { RoomNetworkEventType } from '@app/classes/room-network/events/room-network-event';
import RoomNetworkPlayerAddEvent from '@app/classes/room-network/events/room-network-player-add-event';
import RoomNetworkPlayerRemoveEvent from '@app/classes/room-network/events/room-network-player-remove-event';
import RoomNetworkQueueAddEvent from '@app/classes/room-network/events/room-network-queue-add-event';
import RoomNetworkQueueRemoveEvent from '@app/classes/room-network/events/room-network-queue-remove-event';
import { HostRoomNetwork } from '@app/classes/room-network/host-room-network';
import { PeerRoomNetwork } from '@app/classes/room-network/peer-room-network';
import { RoomNetwork } from '@app/classes/room-network/room-network';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { BehaviorSubject, Observable, Subject, filter } from 'rxjs';

export class Room<RoomServiceNotification extends RoomMessage> {
    private _roomConnection?: RoomNetwork<RoomMessage>;
    // FIXME: rework roomManager not nullable
    public get roomConnection(): RoomNetwork<RoomMessage> {
        if (!this._roomConnection$.value) {
            throw new Error('Room manager is not defined, please set it first');
        }

        return this._roomConnection$.value;
    }

    public get localPlayer(): LocalPlayer {
        return this.roomConnection.localPlayer;
    }

    public players: Map<string, Player> = new Map<string, Player>();
    private readonly _players$ = new BehaviorSubject<Player[]>([]);
    public readonly players$: Observable<Player[]> = this._players$.asObservable();
    private readonly _queue$ = new BehaviorSubject<string[]>([]);
    public readonly queue$: Observable<string[]> = this._queue$.asObservable();
    // FIXME: rework roomManager not nullable, remove this subjects
    private readonly _roomConnection$ = new BehaviorSubject<RoomNetwork<RoomMessage> | undefined>(undefined);
    public readonly roomConnection$: Observable<RoomNetwork<RoomMessage> | undefined> = this._roomConnection$.asObservable();

    protected readonly publicMessenger$ = new Subject<RoomServiceNotification>();

    protected constructor(
        protected readonly ngZone: NgZone,
        protected readonly roomApi: RoomSocketApi,
    ) {
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

    public get roomManagerNotifier(): NotifierFlow<RoomNetworkEventType> {
        return this.roomConnection.notifier;
    }

    public get initiator(): boolean {
        return this.roomConnection.initiator;
    }

    public transmitMessage<T>(type: string, message: T): void {
        const roomServiceMessage: RoomMessage<string, T> = {
            from: this.localPlayer.name,
            type,
            payload: message,
            origin: MessageOriginType.ROOM_SERVICE
        };

        this.players.forEach((player: Player) => {
            player.sendData(roomServiceMessage);
        });
    }

    protected postSetupRoom(): void {
        this.addPlayer(this.localPlayer);
    }

    protected addPlayer(player: Player): void {
        this.players.set(player.name, player);
        this._players$.next(Array.from(this.players.values()));
    }

    public async createRoom(roomName: string, localPlayerName: string, maxPlayer: number): Promise<void> {
        this._roomConnection = await HostRoomNetwork.create<RoomMessage>(this.roomApi, roomName, maxPlayer, localPlayerName, (message: RoomMessage) => this.onMessage(message), this.ngZone);
        this._roomConnection$.next(this._roomConnection);
        this.followRoomManager();

        this.postSetupRoom();
    }

    public async joinRoom(roomName: string, playerName: string): Promise<void> {
        this._roomConnection = await PeerRoomNetwork.create<RoomMessage>(this.roomApi, roomName, playerName, (message: RoomMessage) => this.onMessage(message), this.ngZone);
        this._roomConnection$.next(this._roomConnection);
        this.followRoomManager();

        this.postSetupRoom();
    }

    private followRoomManager(): void {
        this.roomConnection.notifier.follow(RoomNetworkEventType.PLAYER_ADD, this, this.handleRoomPlayerAddEvent.bind(this));
        this.roomConnection.notifier.follow(RoomNetworkEventType.PLAYER_REMOVE, this, this.handleRoomPlayerRemoveEvent.bind(this));
        this.roomConnection.notifier.follow(RoomNetworkEventType.QUEUE_ADD, this, this.handleRoomQueueAddEvent.bind(this));
        this.roomConnection.notifier.follow(RoomNetworkEventType.QUEUE_REMOVE, this, this.handleRoomQueueRemoveEvent.bind(this));
    }

    protected onMessage(message: RoomMessage): void {
        // TODO: rework this type
        console.warn('TOFix: Room service message', message);
        this.publicMessenger$.next(message as RoomServiceNotification);
    }

    public get roomName(): string {
        return this.roomConnection.roomName;
    }

    protected handleRoomPlayerAddEvent(event: RoomNetworkPlayerAddEvent): void {
        const player: Player = event.payload;

        this.ngZone.run(() => {
            this.addPlayer(player);
        });
    }

    protected handleRoomPlayerRemoveEvent(event: RoomNetworkPlayerRemoveEvent): void {
        const player: Player = event.payload;

        this.ngZone.run(() => {
            this.players.delete(player.name);
            this._players$.next(Array.from(this.players.values()));
        });
    }

    protected handleRoomQueueAddEvent(event: RoomNetworkQueueAddEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this._queue$.next(this._queue$.getValue().concat(playerName)));
    }

    protected handleRoomQueueRemoveEvent(event: RoomNetworkQueueRemoveEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this._queue$.next(this._queue$.getValue().filter((name: string) => name !== playerName)));
    }

    public clear(): void {
        if (this._roomConnection !== undefined) {
            this.roomConnection.notifier.unfollow(RoomNetworkEventType.PLAYER_ADD, this);
            this.roomConnection.notifier.unfollow(RoomNetworkEventType.PLAYER_REMOVE, this);
            this.roomConnection.notifier.unfollow(RoomNetworkEventType.QUEUE_ADD, this);
            this.roomConnection.notifier.unfollow(RoomNetworkEventType.QUEUE_REMOVE, this);
            this._roomConnection.clear();
            this._roomConnection = undefined;
        }

        this.roomApi.close();
    }
}
