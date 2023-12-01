import { Injectable, NgZone } from '@angular/core';
import Notifier, { NotifierFlow } from '@app/classes/notifier/notifier';
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
import { BehaviorSubject, Observable } from 'rxjs';
import RoomCreateResponse from '../room-api/responses/room-create-response';
import RoomJoinResponse from '../room-api/responses/room-join-response';
import { RoomApiService } from '../room-api/room-api.service';

export enum RoomServiceEventType {
    IS_READY = 'RoomServiceIsReady'
}

type RoomServiceNotificationType = string;

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
    public queue: Array<string> = [];

    protected readonly _notifier: Notifier<RoomServiceNotificationType, RoomServiceNotification> = new Notifier<RoomServiceNotificationType, RoomServiceNotification>();

    public constructor(protected readonly ngZone: NgZone, protected readonly roomApi: RoomApiService) {
    }

    public get notifier(): NotifierFlow<RoomServiceNotificationType> {
        return this._notifier;
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

    public createRoom(roomName: string, playerName: string, maxPlayer: number): Promise<RoomCreateResponse> {
        const hostRoom = new HostRoomManager<RoomServiceMessage>(this.roomApi, roomName, (message: RoomServiceMessage) => this.onMessage(message));
        this.followRoomManager(hostRoom);
        return hostRoom.create(playerName, maxPlayer);
    }

    protected onMessage(message: RoomServiceMessage): void {
        // TODO: rework this type
        this._notifier.notify(message.type, message as RoomServiceNotification);
    }

    public joinRoom(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const peerRoom = new PeerRoomManager<RoomServiceMessage>(this.roomApi, roomName, (message: RoomServiceMessage) => this.onMessage(message));
        this.followRoomManager(peerRoom);
        return peerRoom.join(playerName);
    }

    private notify<T>(type: RoomServiceNotificationType, payload: T): void {
        // TODO: rework this type
        this._notifier.notify(type, { origin: MessageOriginType.ROOM_SERVICE, payload } as RoomServiceNotification);
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
        // Todo: remove one of notification
        this.notify<boolean>(RoomServiceEventType.IS_READY, true);
    }

    protected handleRoomPlayerAddEvent(event: RoomPlayerAddEvent): void {
        const player: Player = event.payload;
        if (player.isLocal()) {
            this._localPlayer = player;
        }

        this.ngZone.run(() => this.players.set(player.name, player));
    }

    protected handleRoomPlayerRemoveEvent(event: RoomPlayerRemoveEvent): void {
        const player: Player = event.payload;

        this.ngZone.run(() => this.players.delete(player.name));
    }

    protected handleRoomQueueAddEvent(event: RoomQueueAddEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this.queue.push(playerName));
    }

    protected handleRoomQueueRemoveEvent(event: RoomQueueRemoveEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this.queue = this.queue.filter((name: string) => name !== playerName));
    }

    public roomIsSetup(): boolean {
        return this._roomManager !== undefined;
    }

    public clear(): void {
        if (this._roomManager !== undefined) {
            this._roomManager.clear();
            this._roomManager = undefined;
        }

        this.roomApi.close();
        this._isActive.next(false);
    }
}
