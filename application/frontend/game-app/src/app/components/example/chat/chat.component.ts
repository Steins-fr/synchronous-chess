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
    public remotePlayer: Player;
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
        if (this.remotePlayer) {
            this.remotePlayer.clear();
        }
    }

    public sendMessage(): void {
        this.remotePlayer.sendData({
            type: 'chat',
            message: this.sendInput
        });
        this.chat.push(`${this.localPlayer.name}: ${this.sendInput}`);
        this.sendInput = '';
    }

    public createRoom(): void {
        if (this.socketState === SocketState.OPEN && this.initiator) {
            this.localPlayer = new Player(this.roomName, this.playerName, PlayerType.LOCAL);
            this.socket.send('sendmessage', 'create', JSON.stringify({ roomName: this.roomName, maxPlayer: 2, playerName: this.localPlayer.name }));
        }
    }

    public joinRoom(): void {
        if (this.socketState === SocketState.OPEN && !this.initiator) {
            this.localPlayer = new Player(this.roomName, this.playerName, PlayerType.LOCAL);
            this.socket.send('sendmessage', 'join', JSON.stringify({ roomName: this.roomName, playerName: this.localPlayer.name }));
        }
    }

    public connected(playerName: string): void {
        this.socket.send('sendmessage', 'playerAdd', JSON.stringify({ roomName: this.roomName, playerName: playerName }));
    }

    public disconnected(playerName: string): void {
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

    private subscribeChat(): void {
        this.subs.push(this.remotePlayer.data.subscribe((d: any) => {
            if (d.type === 'chat') {
                this.ngZone.run(() => this.chat.push(`${d.from}: ${d.message}`));
            }
        }));
    }

    private subscribeOnConnected(): void {
        const sub: Subscription = this.remotePlayer.event.subscribe((playerEvent: PlayerEvent) => {
            if (playerEvent.type === PlayerEventType.CONNECTED) {
                if (this.initiator) {
                    this.connected(playerEvent.name);
                } else {
                    this.activeRoom = true;
                }
                sub.unsubscribe();
            }
        });
    }

    private subscribeOnDisconnected(): void {
        const sub: Subscription = this.remotePlayer.event.subscribe((playerEvent: PlayerEvent) => {
            if (playerEvent.type === PlayerEventType.DISCONNECTED) {
                if (this.initiator) {
                    this.disconnected(playerEvent.name);
                }
                sub.unsubscribe();
            }
        });
    }

    private socketMessage(payload: SocketPayload): void {
        const data: any = JSON.parse(payload.data);
        switch (payload.type) {
            case 'created':
                this.activeRoom = true;
                break;
            case 'joiningRoom':
                this.remotePlayer = new Player(this.roomName, data.playerName, PlayerType.REMOTE_HOST, this.socket, new Webrtc());
                this.subscribeChat();
                this.subscribeOnConnected();
                this.subscribeOnDisconnected();
                break;
            case 'joinRequest':
                this.remotePlayer = new Player(this.roomName, data.playerName, PlayerType.REMOTE_PEER, this.socket, new Webrtc());
                this.subscribeChat();
                this.subscribeOnConnected();
                this.subscribeOnDisconnected();
                break;
        }
    }

    public displayEnterRoomButton(): boolean {
        return !this.activeRoom && this.socketState === SocketState.OPEN;
    }
}
