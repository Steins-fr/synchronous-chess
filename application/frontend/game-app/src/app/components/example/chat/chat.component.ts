import { Component, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebSocketService, SocketState, SocketPayload } from 'src/app/services/web-socket/web-socket.service';
import { environment } from 'src/environments/environment';
import { Player, PlayerType, PlayerEvent, PlayerEventType } from 'src/app/classes/player/player';
import { Webrtc, WebrtcStates } from 'src/app/classes/webrtc/webrtc';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss'],
    providers: [WebSocketService]
})
export class ChatComponent implements OnDestroy {

    private readonly subs: Array<Subscription> = [];

    public localPlayer: Player;
    public remotePlayers: Array<Player> = [];
    public participants: Array<string> = [];
    public initiator: boolean = null;
    public roomName: string = '';
    public playerName: string = '';
    public activeRoom: boolean = false;

    public signalInput: string = '';
    public sendInput: string = '';
    public socketState: SocketState = SocketState.CONNECTING;

    public chat: Array<string> = [];

    public constructor(public socket: WebSocketService, private readonly ngZone: NgZone) { }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.remotePlayers.forEach((player: Player) => player.clear());
    }

    private transmitMessage(message: string, from: string, isPropagation: boolean = false): void {
        this.remotePlayers.forEach((player: Player) => {
            if (isPropagation === true && player.name === from) {
                return; // Don't send message to the expeditor
            }

            player.sendData({
                type: 'chat',
                message,
                from,
                isPropagation
            });
        });
    }

    private updateParticipants(): void {
        const remoteParticipants: Array<string> = this.remotePlayers.filter((player: Player) => player.isConnected)
            .map((player: Player) => player.name);
        this.ngZone.run(() => this.participants = [this.localPlayer.name, ...remoteParticipants]);
    }

    private transmitParticipants(): void {
        this.updateParticipants();
        this.remotePlayers.forEach((player: Player) => {
            console.log(player);
            player.sendData({
                type: 'participants',
                participants: JSON.stringify(this.participants)
            });
        });
    }

    public sendMessage(): void {
        this.transmitMessage(this.sendInput, this.localPlayer.name);
        this.chat.push(`${this.localPlayer.name}: ${this.sendInput}`);
        this.sendInput = '';
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

    public connected(playerName: string): void {
        this.transmitParticipants();
        this.socket.send('sendmessage', 'playerAdd', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    public disconnected(playerName: string): void {
        this.transmitParticipants();
        this.socket.send('sendmessage', 'playerRemove', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    public enterRoom(): void {
        this.initiator ? this.createRoom() : this.joinRoom();
    }

    public setMode(initiator: boolean): void {
        this.initiator = initiator;

        this.socket.connect(new WebSocket(environment.webSocketServer));
        this.subs.push(this.socket.state.subscribe((state: SocketState) => {
            this.socketState = state;
        }));

        this.subs.push(this.socket.message.subscribe((payload: SocketPayload) => this.socketMessage(payload)));

    }

    private subscribeParticipants(player: Player): void { // TODO: memory leak
        this.subs.push(player.data.subscribe((d: any) => {
            if (d.type === 'participants') {
                this.ngZone.run(() => this.participants = JSON.parse(d.participants));
            }
        }));
    }

    private subscribeChat(player: Player): void { // TODO: memory leak
        this.subs.push(player.data.subscribe((d: any) => {
            if (d.type === 'chat') {
                this.ngZone.run(() => this.chat.push(`${d.from}: ${d.message}`));
                if (d.isPropagation === false) {
                    this.transmitMessage(d.message, d.from, true);
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
                this.subscribeChat(player);
                this.subscribeParticipants(player);
                this.subscribeOnConnected(player);
                this.subscribeOnDisconnected(player);
                break;
            case 'joinRequest':
                player = new Player(this.roomName, data.playerName, PlayerType.REMOTE_PEER, this.socket, new Webrtc());
                this.ngZone.run(() => this.remotePlayers.push(player));
                this.subscribeChat(player);
                this.subscribeOnConnected(player);
                this.subscribeOnDisconnected(player);
                break;
        }
    }

    public displayEnterRoomButton(): boolean {
        return !this.activeRoom && this.socketState === SocketState.OPEN;
    }
}
