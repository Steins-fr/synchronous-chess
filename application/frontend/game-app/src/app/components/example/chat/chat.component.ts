import { Component, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebSocketService, SocketState } from 'src/app/services/web-socket/web-socket.service';
import { RoomService } from 'src/app/services/room/room.service';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss'],
    providers: [WebSocketService, RoomService]
})
export class ChatComponent implements OnDestroy {

    private readonly subs: Array<Subscription> = [];

    public sendInput: string = '';

    public chat: Array<string> = [];

    public constructor(
        public socketService: WebSocketService,
        public roomService: RoomService,
        private readonly ngZone: NgZone) { }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.roomService.clear();
    }

    public sendMessage(): void {
        this.roomService.transmitMessage('chat', this.sendInput, this.roomService.localPlayer.name);
        this.chat.push(`${this.roomService.localPlayer.name}: ${this.sendInput}`);
        this.sendInput = '';
    }

    private listenChat(): void {
        this.subs.push(this.roomService.onData.subscribe((d: any) => {
            if (d.type === 'chat') {
                this.ngZone.run(() => this.chat.push(`${d.from}: ${d.message}`));
            }
        }));
    }

    public setMode(initiator: boolean): void {
        this.roomService.setup(initiator, this.socketService);
        this.listenChat();
    }

    public displayEnterRoomButton(): boolean {
        return !this.roomService.activeRoom && this.roomService.socketState === SocketState.OPEN;
    }
}
