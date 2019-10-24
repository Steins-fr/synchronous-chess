import { Component, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { RoomService } from 'src/app/services/room/room.service';
import { PlayerMessageType, PlayerMessage } from 'src/app/classes/player/player';

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnDestroy {

    private readonly subs: Array<Subscription> = [];
    public sendInput: string = '';
    public chat: Array<string> = [];

    public constructor(
        public roomService: RoomService,
        private readonly ngZone: NgZone) {
        this.listenChat();
    }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.roomService.clear();
    }

    public sendMessage(): void {
        this.roomService.transmitMessage(PlayerMessageType.CHAT, this.sendInput);
        this.chat.push(`${this.roomService.room.localPlayer.name}: ${this.sendInput}`);
        this.sendInput = '';
    }

    private listenChat(): void {
        this.subs.push(this.roomService.onMessage.subscribe((message: PlayerMessage) => {
            if (message.type === PlayerMessageType.CHAT) {
                this.ngZone.run(() => this.chat.push(`${message.from}: ${message.payload}`));
            }
        }));
    }
}
