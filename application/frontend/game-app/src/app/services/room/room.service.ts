import { Injectable, NgZone } from '@angular/core';
import { WebSocketService, SocketPayload, SocketState } from '../web-socket/web-socket.service';
import { Player, PlayerType, PlayerEventType, PlayerEvent } from 'src/app/classes/player/player';
import { Subscription, Subject, Observable } from 'rxjs';
import { Webrtc } from 'src/app/classes/webrtc/webrtc';
import { environment } from 'src/environments/environment';

@Injectable()
export class RoomService {

    private readonly subs: Array<Subscription> = [];

    private socket: WebSocketService;
    public localPlayer: Player;
    public remotePlayers: Array<Player> = [];
    public participants: Array<string> = [];
    public initiator: boolean = null;
    public roomName: string = '';
    public playerName: string = '';
    public activeRoom: boolean = false;
    public socketState: SocketState = SocketState.CONNECTING;
    private readonly _onData: Subject<any> = new Subject<any>();
    public readonly onData: Observable<any> = this._onData.asObservable();

    public constructor(private readonly ngZone: NgZone) { }

    public setup(initiator: boolean, socket: WebSocketService): void {
        this.initiator = initiator;
        this.socket = socket;
        this.socket.connect(new WebSocket(environment.webSocketServer));
        this.subs.push(this.socket.state.subscribe((state: SocketState) => {
            this.socketState = state;
        }));

        this.subs.push(this.socket.message.subscribe((payload: SocketPayload) => this.socketMessage(payload)));
    }

    public transmitMessage(type: string, message: string, from: string, isPropagation: boolean = false): void {
        this.remotePlayers.forEach((player: Player) => {
            if (isPropagation === true && player.name === from) {
                return; // Don't send message to the expeditor
            }

            player.sendData({
                type,
                message,
                from,
                isPropagation
            });
        });
    }

    public createRoom(): void {
        if (this.socketState === SocketState.OPEN && this.initiator) {
            this.localPlayer = new Player(this.roomName, this.playerName, PlayerType.LOCAL);
            this.socket.send('sendmessage', 'create', JSON.stringify({ roomName: this.roomName, maxPlayer: 6, playerName: this.localPlayer.name }));
        }
    }

    public joinRoom(): void {
        if (this.socketState === SocketState.OPEN && !this.initiator) {
            this.localPlayer = new Player(this.roomName, this.playerName, PlayerType.LOCAL);
            this.socket.send('sendmessage', 'join', JSON.stringify({ roomName: this.roomName, playerName: this.localPlayer.name }));
        }
    }

    public enterRoom(): void {
        this.initiator ? this.createRoom() : this.joinRoom();
    }

    private connected(playerName: string): void {
        this.transmitParticipants();
        this.socket.send('sendmessage', 'playerAdd', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    private disconnected(playerName: string): void {
        this.transmitParticipants();
        this.socket.send('sendmessage', 'playerRemove', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    private updateParticipants(): void {
        const remoteParticipants: Array<string> = this.remotePlayers.filter((player: Player) => player.isConnected)
            .map((player: Player) => player.name);
        this.ngZone.run(() => this.participants = [this.localPlayer.name, ...remoteParticipants]);
    }

    private transmitParticipants(): void {
        this.updateParticipants();
        this.remotePlayers.forEach((player: Player) => {
            player.sendData({
                type: 'participants',
                participants: JSON.stringify(this.participants)
            });
        });
    }

    private subscribeParticipants(player: Player): void { // TODO: memory leak
        this.subs.push(player.data.subscribe((d: any) => {
            if (d.type === 'participants') {
                this.ngZone.run(() => this.participants = JSON.parse(d.participants));
            }
        }));
    }

    private subscribeData(player: Player): void { // TODO: memory leak
        this.subs.push(player.data.subscribe((data: any) => {
            this._onData.next(data);
            if (data.type === 'chat') {
                if (data.isPropagation === false) {
                    this.transmitMessage(data.type, data.message, data.from, true);
                }
            }
        }));
    }

    private subscribeOnConnected(player: Player): void { // TODO: memory leak
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent) => {
            if (playerEvent.type === PlayerEventType.CONNECTED) {
                if (this.initiator) {
                    this.connected(playerEvent.name);
                } else {
                    this.ngZone.run(() => this.activeRoom = true);
                }
                sub.unsubscribe();
            }
        });
    }

    private subscribeOnDisconnected(player: Player): void { // TODO: memory leak
        const sub: Subscription = player.event.subscribe((playerEvent: PlayerEvent) => {
            if (playerEvent.type === PlayerEventType.DISCONNECTED) {
                if (this.initiator) {
                    this.disconnected(playerEvent.name);
                } else {
                    this.updateParticipants();
                }
                sub.unsubscribe();
            }
        });
    }

    private socketMessage(payload: SocketPayload): void {
        const data: any = JSON.parse(payload.data);
        let player: Player;
        switch (payload.type) {
            case 'created':
                this.activeRoom = true;
                this.updateParticipants();
                break;
            case 'joiningRoom':
                player = new Player(this.roomName, data.playerName, PlayerType.REMOTE_HOST, this.socket, new Webrtc());
                this.ngZone.run(() => this.remotePlayers.push(player));
                this.subscribeData(player);
                this.subscribeParticipants(player);
                this.subscribeOnConnected(player);
                this.subscribeOnDisconnected(player);
                break;
            case 'joinRequest':
                player = new Player(this.roomName, data.playerName, PlayerType.REMOTE_PEER, this.socket, new Webrtc());
                this.ngZone.run(() => this.remotePlayers.push(player));
                this.subscribeData(player);
                this.subscribeOnConnected(player);
                this.subscribeOnDisconnected(player);
                break;
        }
    }

    public clear(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.remotePlayers.forEach((player: Player) => player.clear());
    }
}
