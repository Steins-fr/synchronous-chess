import { Injectable, NgZone } from '@angular/core';
import { Subscription, BehaviorSubject, Observable, Subject } from 'rxjs';

import { Message } from 'src/app/classes/webrtc/messages/message';
import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';
import MessageOriginType from 'src/app/classes/webrtc/messages/message-origin.types';

import { Room } from 'src/app/classes/room/room';
import { HostRoom } from 'src/app/classes/room/host-room';
import { PeerRoom } from 'src/app/classes/room/peer-room';

import { RoomApiService } from '../room-api/room-api.service';

@Injectable(
    { providedIn: 'root' }
)
export class RoomService {

    protected subs: Array<Subscription> = [];

    public room: Room;

    private readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    protected _onMessage: Subject<Message> = new Subject<Message>();
    public onMessage: Observable<Message> = this._onMessage.asObservable();

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
        this.room.transmitMessage(roomServiceMessage);
    }

    public enterRoom(host: boolean, roomName: string, playerName: string): void {
        this.room = host ? new HostRoom(this.roomApi) : new PeerRoom(this.roomApi);
        this.room.setup(this._onMessage);
        this.room.create(roomName, playerName).then(() => {
            this.ngZone.run(() => this._isActive.next(true));
        }).catch(() => {
            this.room.clear();
            this.room = undefined;
        });
    }

    public waitingRoomInformation(): boolean {
        return this.roomApi.isSocketOpen() && !(this.room !== undefined && this.room.isSetup);
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        if (this.room !== undefined) {
            this.room.clear();
            this.room = undefined;
        }

        this.roomApi.close();
        this._isActive.next(false);
    }
}
