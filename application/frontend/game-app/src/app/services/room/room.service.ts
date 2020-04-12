import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { RoomServiceMessage } from '../../classes/webrtc/messages/room-service-message';
import MessageOriginType from '../../classes/webrtc/messages/message-origin.types';

import { RoomManager } from '../../classes/room-manager/room-manager';
import { HostRoomManager } from '../../classes/room-manager/host-room-manager';
import { PeerRoomManager } from '../../classes/room-manager/peer-room-manager';

import { RoomApiService } from '../room-api/room-api.service';
import RoomEvent, { RoomEventType } from '../../classes/room-manager/events/room-event';
import RoomPlayerAddEvent from '../../classes/room-manager/events/room-player-add-event';
import { Player } from '../../classes/player/player';
import RoomPlayerRemoveEvent from '../../classes/room-manager/events/room-player-remove-event';
import RoomQueueAddEvent from '../../classes/room-manager/events/room-queue-add-event';
import RoomQueueRemoveEvent from '../../classes/room-manager/events/room-queue-remove-event';
import RoomCreateResponse from '../room-api/responses/room-create-response';
import RoomJoinResponse from '../room-api/responses/room-join-response';
import Notifier, { NotifierFlow } from '../../classes/notifier/notifier';
import { RoomMessage } from '../../classes/webrtc/messages/room-message';
import RoomReadyEvent from '../../classes/room-manager/events/room-ready-event';

export enum RoomServiceEventType {
    IS_READY = 'RoomServiceIsReady'
}

type RoomServiceNotificationType = string;
type RoomServiceNotification = RoomMessage;

@Injectable(
    { providedIn: 'root' }
)
export class RoomService {

    public roomManager?: RoomManager;

    protected readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    public localPlayer?: Player;
    public players: Map<string, Player> = new Map<string, Player>();
    public queue: Array<string> = [];

    protected readonly _notifier: Notifier<RoomServiceNotificationType, RoomServiceNotification> = new Notifier<RoomServiceNotificationType, RoomServiceNotification>();

    public constructor(protected readonly ngZone: NgZone, protected readonly roomApi: RoomApiService) {
    }

    public get notifier(): NotifierFlow<RoomServiceNotificationType, RoomServiceNotification> {
        return this._notifier;
    }

    public get roomManagerNotifier(): NotifierFlow<RoomEventType, RoomEvent> {
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
        return this.roomManager !== undefined;
    }

    public createRoom(roomName: string, playerName: string, maxPlayer: number): Promise<RoomCreateResponse> {
        const hostRoom: HostRoomManager = new HostRoomManager(this.roomApi, roomName);
        this.followRoomManager(hostRoom);
        hostRoom.setup((message: RoomServiceMessage) => this.onMessage(message));
        return hostRoom.create(playerName, maxPlayer);
    }

    protected onMessage(message: RoomServiceMessage): void {
        this._notifier.notify(message.type, message);
    }

    public joinRoom(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const peerRoom: PeerRoomManager = new PeerRoomManager(this.roomApi, roomName);
        this.followRoomManager(peerRoom);
        peerRoom.setup((message: RoomServiceMessage) => this.onMessage(message));
        return peerRoom.join(playerName);
    }

    private notify<T>(type: RoomServiceNotificationType, payload: T): void {
        this._notifier.notify(type, { origin: MessageOriginType.ROOM_SERVICE, payload });
    }

    private followRoomManager(roomManager: RoomManager): void {
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
        this.roomManager = event.payload;
        this.ngZone.run(() => this._isActive.next(true));
        // Todo: remove one of notification
        this.notify<boolean>(RoomServiceEventType.IS_READY, true);
    }

    protected handleRoomPlayerAddEvent(event: RoomPlayerAddEvent): void {
        const player: Player = event.payload;
        if (player.isLocal()) {
            this.localPlayer = player;
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
        return this.roomManager !== undefined && this.roomManager.isSetup;
    }

    public clear(): void {
        if (this.roomManager !== undefined) {
            this.roomManager.clear();
            this.roomManager = undefined;
        }

        this.roomApi.close();
        this._isActive.next(false);
    }
}
