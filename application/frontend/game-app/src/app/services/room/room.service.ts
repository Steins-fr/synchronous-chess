import { Injectable, NgZone } from '@angular/core';
import { Subscription, BehaviorSubject, Observable, Subject } from 'rxjs';

import { Message } from 'src/app/classes/webrtc/messages/message';
import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';
import MessageOriginType from 'src/app/classes/webrtc/messages/message-origin.types';

import { RoomManager } from 'src/app/classes/room-manager/room-manager';
import { HostRoomManager } from 'src/app/classes/room-manager/host-room-manager';
import { PeerRoomManager } from 'src/app/classes/room-manager/peer-room-manager';

import { RoomApiService } from '../room-api/room-api.service';
import RoomEvent from 'src/app/classes/room-manager/events/room-event';
import RoomPlayerAddEvent from 'src/app/classes/room-manager/events/room-player-add-event';
import { Player } from 'src/app/classes/player/player';
import RoomPlayerRemoveEvent from 'src/app/classes/room-manager/events/room-player-remove-event';
import RoomQueueAddEvent from 'src/app/classes/room-manager/events/room-queue-add-event';
import RoomQueueRemoveEvent from 'src/app/classes/room-manager/events/room-queue-remove-event';

interface RoomEventHandlers {
    playerAdd: (event: RoomPlayerAddEvent) => void;
    playerRemove: (event: RoomPlayerRemoveEvent) => void;
    queueAdd: (event: RoomQueueAddEvent) => void;
    queueRemove: (event: RoomQueueRemoveEvent) => void;
}

type RoomEventHandler = (event: RoomEvent) => void;

@Injectable(
    { providedIn: 'root' }
)
export class RoomService {

    private roomManagerEventSub?: Subscription;
    public roomManager: RoomManager;
    public roomName: string = '';

    private readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    public localPlayer?: Player;
    public players: Map<string, Player> = new Map<string, Player>();
    public queue: Array<string> = [];

    private readonly _onMessage: Subject<Message> = new Subject<Message>();
    public onMessage: Observable<Message> = this._onMessage.asObservable();

    private readonly roomEventHandlers: RoomEventHandlers = {
        playerAdd: this.handleRoomPlayerAddEvent.bind(this),
        playerRemove: this.handleRoomPlayerRemoveEvent.bind(this),
        queueAdd: this.handleRoomQueueAddEvent.bind(this),
        queueRemove: this.handleRoomQueueRemoveEvent.bind(this)
    };

    public constructor(private readonly ngZone: NgZone, private readonly roomApi: RoomApiService) { }

    public setup(): void {
        this.roomApi.setup();
    }

    public transmitMessage<T>(type: T, message: string): void {
        const roomServiceMessage: RoomServiceMessage<T> = {
            type,
            payload: message,
            origin: MessageOriginType.ROOM_SERVICE
        };
        this.roomManager.transmitMessage(roomServiceMessage);
    }

    private createRoom(roomName: string, playerName: string): void {
        const hostRoom: HostRoomManager = new HostRoomManager(this.roomApi);
        hostRoom.setup(this._onMessage);
        hostRoom.create(roomName, playerName)
            .then(() => this.finalizeSetup(roomName, hostRoom))
            .catch(() => {
                hostRoom.clear();
            });
    }

    private joinRoom(roomName: string, playerName: string): void {
        const peerRoom: PeerRoomManager = new PeerRoomManager(this.roomApi);
        peerRoom.setup(this._onMessage);
        peerRoom.join(roomName, playerName)
            .then(() => this.finalizeSetup(roomName, peerRoom))
            .catch(() => {
                peerRoom.clear();
            });
    }

    private finalizeSetup(roomName: string, roomManager: RoomManager): void {
        this.roomManager = roomManager;
        this.roomName = roomName;
        this.ngZone.run(() => this._isActive.next(true));
        this.roomManagerEventSub = this.roomManager.events.subscribe((event: RoomEvent) => this.handleRoomEvent(event));
    }

    public enterRoom(host: boolean, roomName: string, playerName: string): void {
        host ? this.createRoom(roomName, playerName) : this.joinRoom(roomName, playerName);
    }

    private handleRoomEvent(event: RoomEvent): void {
        const handler: RoomEventHandler = this.roomEventHandlers[event.type];
        if (handler !== undefined) {
            handler(event);
        }
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
        if (this.roomManagerEventSub && this.roomManagerEventSub.closed === false) {
            this.roomManagerEventSub.unsubscribe();
        }
        if (this.roomManager !== undefined) {
            this.roomManager.clear();
            this.roomManager = undefined;
        }

        this.roomApi.close();
        this._isActive.next(false);
    }
}
