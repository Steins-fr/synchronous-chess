import { Injectable, NgZone } from '@angular/core';
import { WebSocketService, SocketState } from '../web-socket/web-socket.service';
import { PlayerMessageType, PlayerMessage } from 'src/app/classes/player/player';
import { environment } from 'src/environments/environment';
import { Room } from 'src/app/classes/room/room';
import { HostRoom } from 'src/app/classes/room/host-room';
import { PeerRoom } from 'src/app/classes/room/peer-room';
import { Subscription, BehaviorSubject, Observable, Subject } from 'rxjs';

@Injectable(
    { providedIn: 'root' }
)
export class RoomService {

    protected subs: Array<Subscription> = [];
    private socketService?: WebSocketService;

    public room: Room;

    public socketState: SocketState = SocketState.CONNECTING;

    private readonly _isActive: BehaviorSubject<boolean> = new BehaviorSubject(false);
    public readonly isActive: Observable<boolean> = this._isActive.asObservable();

    protected _onMessage: Subject<PlayerMessage> = new Subject<PlayerMessage>();
    public onMessage: Observable<PlayerMessage> = this._onMessage.asObservable();

    public constructor(private readonly ngZone: NgZone) {
    }

    public setup(socketService: WebSocketService): void {
        this.clear();
        this.socketService = socketService;
        this.socketService.connect(new WebSocket(environment.webSocketServer));
        this.subs.push(this.socketService.state.subscribe((state: SocketState) => {
            this.socketState = state;
        }));
    }

    public transmitMessage(type: PlayerMessageType, message: string): void {
        this.room.transmitMessage(type, message);
    }

    public enterRoom(host: boolean, roomName: string, playerName: string): void {
        this.room = host ? new HostRoom() : new PeerRoom();
        this.room.setup(this.socketService, this._onMessage);
        this.subs.push(this.room.create(roomName, playerName).subscribe((hasSucceeded: boolean) => {
            if (hasSucceeded === false) {
                this.room.clear();
                this.room = undefined;
            }
            this.ngZone.run(() => this._isActive.next(hasSucceeded));
        }));
    }

    public waitingRoomInformation(): boolean {
        return this.socketState === SocketState.OPEN && !(this.room !== undefined && this.room.isSetup);
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        if (this.room !== undefined) {
            this.room.clear();
            this.room = undefined;
        }
        if (this.socketService) {
            this.socketService.close();
        }
        this._isActive.next(false);
    }
}
