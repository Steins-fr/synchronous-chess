import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';
import MessageOriginType from 'src/app/classes/webrtc/messages/message-origin.types';

import { RoomManager } from 'src/app/classes/room-manager/room-manager';
import { HostRoomManager } from 'src/app/classes/room-manager/host-room-manager';
import { PeerRoomManager } from 'src/app/classes/room-manager/peer-room-manager';

import { RoomApiService } from '../room-api/room-api.service';
import { RoomEventType } from 'src/app/classes/room-manager/events/room-event';
import RoomPlayerAddEvent from 'src/app/classes/room-manager/events/room-player-add-event';
import { Player } from 'src/app/classes/player/player';
import RoomPlayerRemoveEvent from 'src/app/classes/room-manager/events/room-player-remove-event';
import RoomQueueAddEvent from 'src/app/classes/room-manager/events/room-queue-add-event';
import RoomQueueRemoveEvent from 'src/app/classes/room-manager/events/room-queue-remove-event';
import RoomCreateResponse from '../room-api/responses/room-create-response';
import RoomJoinResponse from '../room-api/responses/room-join-response';
import Notifier, { NotifierFlow } from 'src/app/classes/notifier/notifier';

type RoomServiceNotificationType = string;
type RoomServiceNotification = RoomServiceMessage;

@Injectable(
    { providedIn: 'root' }
)
export class RoomService {

    public roomManager?: RoomManager;
    public roomName: string = '';

    private readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    public localPlayer?: Player;
    public players: Map<string, Player> = new Map<string, Player>();
    public queue: Array<string> = [];

    private readonly _notifier: Notifier<RoomServiceNotificationType, RoomServiceNotification> = new Notifier<RoomServiceNotificationType, RoomServiceNotification>();

    public constructor(private readonly ngZone: NgZone, private readonly roomApi: RoomApiService) { }

    public get notifier(): NotifierFlow<RoomServiceNotificationType, RoomServiceNotification> {
        return this._notifier;
    }

    public setup(): void {
        this.roomApi.setup();
    }

    public transmitMessage<T, U>(type: T, message: U): void {
        if (this.isReady()) {
            const roomServiceMessage: RoomServiceMessage<T, U> = {
                type,
                payload: message,
                origin: MessageOriginType.ROOM_SERVICE
            };
            this.roomManager.transmitMessage(roomServiceMessage);
        }
    }

    public isReady(): boolean {
        return this.roomManager !== undefined;
    }

    public async createRoom(roomName: string, playerName: string, maxPlayer: number): Promise<RoomCreateResponse> {
        const hostRoom: HostRoomManager = new HostRoomManager(this.roomApi);
        this.followRoomManager(hostRoom);
        hostRoom.setup((message: RoomServiceMessage) => this.onMessage(message));
        try {
            const response: RoomCreateResponse = await hostRoom.create(roomName, playerName, maxPlayer);
            this.finalizeSetup(roomName, hostRoom);
            return response;
        } catch (err) {
            hostRoom.clear();
            return Promise.reject(err);
        }
    }

    private onMessage(message: RoomServiceMessage): void {
        this._notifier.notify(message.type, message);
    }

    public async joinRoom(roomName: string, playerName: string): Promise<RoomJoinResponse> {
        const peerRoom: PeerRoomManager = new PeerRoomManager(this.roomApi);
        this.followRoomManager(peerRoom);
        peerRoom.setup((message: RoomServiceMessage) => this.onMessage(message));
        try {
            const response: RoomJoinResponse = await peerRoom.join(roomName, playerName);
            this.finalizeSetup(roomName, peerRoom);
            return response;
        } catch (err) {
            peerRoom.clear();
            return Promise.reject(err);
        }
    }

    private finalizeSetup(roomName: string, roomManager: RoomManager): void {
        this.roomManager = roomManager;
        this.roomName = roomName;
        this.ngZone.run(() => this._isActive.next(true));
    }

    private followRoomManager(roomManager: RoomManager): void {
        roomManager.notifier.follow(RoomEventType.PLAYER_ADD, this, this.handleRoomPlayerAddEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.PLAYER_REMOVE, this, this.handleRoomPlayerRemoveEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.QUEUE_ADD, this, this.handleRoomQueueAddEvent.bind(this));
        roomManager.notifier.follow(RoomEventType.QUEUE_REMOVE, this, this.handleRoomQueueRemoveEvent.bind(this));
    }

    private handleRoomPlayerAddEvent(event: RoomPlayerAddEvent): void {
        const player: Player = event.payload;
        if (player.isLocal()) {
            this.localPlayer = player;
        }

        this.ngZone.run(() => this.players.set(player.name, player));
    }

    private handleRoomPlayerRemoveEvent(event: RoomPlayerRemoveEvent): void {
        const player: Player = event.payload;
        this.ngZone.run(() => this.players.delete(player.name));
    }

    private handleRoomQueueAddEvent(event: RoomQueueAddEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this.queue.push(playerName));
    }

    private handleRoomQueueRemoveEvent(event: RoomQueueRemoveEvent): void {
        const playerName: string = event.payload;
        this.ngZone.run(() => this.queue = this.queue.filter((name: string) => name !== playerName));
    }

    public waitingRoomInformation(): boolean {
        return this.roomApi.isSocketOpen() && !this.roomIsSetup();
    }

    private roomIsSetup(): boolean {
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
