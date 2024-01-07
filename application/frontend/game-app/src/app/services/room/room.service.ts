import { Injectable, NgZone } from '@angular/core';
import { NotifierFlow } from '@app/classes/notifier/notifier';
import { Player } from '@app/classes/player/player';
import { RoomEventType } from '@app/classes/room-manager/events/room-event';
import RoomPlayerAddEvent from '@app/classes/room-manager/events/room-player-add-event';
import RoomPlayerRemoveEvent from '@app/classes/room-manager/events/room-player-remove-event';
import RoomQueueAddEvent from '@app/classes/room-manager/events/room-queue-add-event';
import RoomQueueRemoveEvent from '@app/classes/room-manager/events/room-queue-remove-event';
import RoomReadyEvent from '@app/classes/room-manager/events/room-ready-event';
import { HostRoomManager } from '@app/classes/room-manager/host-room-manager';
import { PeerRoomManager } from '@app/classes/room-manager/peer-room-manager';
import { RoomManager } from '@app/classes/room-manager/room-manager';
import MessageOriginType from '@app/classes/webrtc/messages/message-origin.types';
import { RoomServiceMessage } from '@app/classes/webrtc/messages/room-service-message';
import { BehaviorSubject, Observable, Subject, filter } from 'rxjs';
import RoomCreateResponse from '../room-api/responses/room-create-response';
import RoomJoinResponse from '../room-api/responses/room-join-response';
import { RoomApiService } from '../room-api/room-api.service';

// TODO: rework factory of room service to remove @Injectable root for child classes
@Injectable(
    { providedIn: 'root' }
)
export class RoomService<RoomServiceNotification extends RoomServiceMessage> {
    private _roomManager?: RoomManager<RoomServiceMessage>;
    public get roomManager(): RoomManager<RoomServiceMessage> {
        if (!this._roomManager) {
            throw new Error('Room manager is not defined, please set it first');
        }

        return this._roomManager;
    }

    protected readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    private _localPlayer?: Player;
    public get localPlayer(): Player {
        if (!this._localPlayer) {
            throw new Error('Local player is not defined, please set it first');
        }

        return this._localPlayer;
    }

    public set localPlayer(value: Player) {
        this._localPlayer = value;
    }

    public players: Map<string, Player> = new Map<string, Player>();
    private readonly _players$ = new BehaviorSubject<Player[]>([]);
    public readonly players$: Observable<Player[]> = this._players$.asObservable();
    private readonly _queue$ = new BehaviorSubject<string[]>([]);
    public readonly queue$: Observable<string[]> = this._queue$.asObservable();

    protected readonly publicMessenger$ = new Subject<RoomServiceNotification>();

    public constructor(protected readonly ngZone: NgZone, protected readonly roomApi: RoomApiService) {
    }

    public messenger(messageType: string[] | string): Observable<RoomServiceNotification> {
        return this.publicMessenger$.asObservable().pipe(filter((message: RoomServiceNotification) => {
            if (Array.isArray(messageType)) {
                return messageType.includes(message.type);
            }

            return message.type === messageType;
        }));
    }

    public get roomManagerNotifier(): NotifierFlow<RoomEventType> {
        return this.roomManager.notifier;
    }

    public get initiator(): boolean {
        return this.roomManager.initiator;
    }

    public setup(): void {
        this.roomApi.setup();
    }

    public transmitMessage<T>(type: string, message: T): void {
        if (this.isReady()) {
            const roomServiceMessage: RoomServiceMessage<string, T> = {
                from: this.localPlayer.name,
                type,
                payload: message,
                origin: MessageOriginType.ROOM_SERVICE
            };

            this.players.forEach((player: Player) => {
                player.sendData(roomServiceMessage);
            });
        }
    }

    public isReady(): boolean {
        return this._roomManager !== undefined;
    }

    public async createRoom(roomName: string, playerName: string, maxPlayer: number): Promise<RoomCreateResponse> {
        const hostRoom = new HostRoomManager<RoomServiceMessage>(this.roomApi, roomName, (message: RoomServiceMessage) => this.onMessage(message), this.ngZone);
        this.followRoomManager(hostRoom);

        try {
            return await hostRoom.create(playerName, maxPlayer);
        } catch (err) {
            this.clear();
            throw err;
        }
    }

    protected onMessage(message: RoomServiceMessage): void {
        // TODO: rework this type
        console.log('Room service message', message);
        this.publicMessenger$.next(message as RoomServiceNotification);
    }

    public async joinRoom(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const peerRoom = new PeerRoomManager<RoomServiceMessage>(this.roomApi, roomName, (message: RoomServiceMessage) => this.onMessage(message), this.ngZone);
        this.followRoomManager(peerRoom);

        try {
            return await peerRoom.join(playerName);
        } catch (err) {
            this.clear();
            throw err;
        }
    }

    private followRoomManager(roomManager: RoomManager<RoomServiceMessage>): void {
        roomManager.notifier.follow(RoomEventType.READY, this, this.handleRoomManagerReadyEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.PLAYER_ADD, this, this.handleRoomPlayerAddEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.PLAYER_REMOVE, this, this.handleRoomPlayerRemoveEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.QUEUE_ADD, this, this.handleRoomQueueAddEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.QUEUE_REMOVE, this, this.handleRoomQueueRemoveEvent.bind(this));
    }

    public get roomName(): string {
        return this.roomManager.roomName;
    }

    protected handleRoomManagerReadyEvent(event: RoomReadyEvent): void {
        this._roomManager = event.payload;
        this.ngZone.run(() => {
            this._isActive.next(true);
        });
    }

    protected handleRoomPlayerAddEvent(event: RoomPlayerAddEvent): void {
        const player: Player = event.payload;
        if (player.isLocal()) {
            this._localPlayer = player;
        }

        this.ngZone.run(() => {
            this.players.set(player.name, player);
            this._players$.next(Array.from(this.players.values()));
        });
    }

    protected handleRoomPlayerRemoveEvent(event: RoomPlayerRemoveEvent): void {
        const player: Player = event.payload;

        this.ngZone.run(() => {
            this.players.delete(player.name);
            this._players$.next(Array.from(this.players.values()));
        });
    }

    protected handleRoomQueueAddEvent(event: RoomQueueAddEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this._queue$.next(this._queue$.getValue().concat(playerName)));
    }

    protected handleRoomQueueRemoveEvent(event: RoomQueueRemoveEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this._queue$.next(this._queue$.getValue().filter((name: string) => name !== playerName)));
    }

    public roomIsSetup(): boolean {
        return this._roomManager !== undefined;
    }

    public clear(): void {
        if (this._roomManager !== undefined) {
            this.roomManager.notifier.unfollow(RoomEventType.READY, this);
            this.roomManager.notifier.unfollow(RoomEventType.PLAYER_ADD, this);
            this.roomManager.notifier.unfollow(RoomEventType.PLAYER_REMOVE, this);
            this.roomManager.notifier.unfollow(RoomEventType.QUEUE_ADD, this);
            this.roomManager.notifier.unfollow(RoomEventType.QUEUE_REMOVE, this);
            this._roomManager.clear();
            this._roomManager = undefined;
        }

        this.roomApi.close();
        this._isActive.next(false);
    }
}
