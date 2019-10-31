import { Component, OnDestroy, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';

import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';

import { RoomService } from 'src/app/services/room/room.service';

enum ChatMessageType {
    CHAT = 'chat'
}

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnDestroy {

    private readonly subs: Array<Subscription> = [];
    public sendInput: string = '';
    public chat: Array<string> = [];
    public maxPlayer: number = 6;

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
        this.roomService.transmitMessage(ChatMessageType.CHAT, this.sendInput);
        this.chat.push(`${this.roomService.localPlayer.name}: ${this.sendInput}`);
        this.sendInput = '';
    }

    private listenChat(): void {
        this.subs.push(this.roomService.onMessage.subscribe((message: RoomServiceMessage<ChatMessageType>) => {
            if (message.type === ChatMessageType.CHAT) {
                this.ngZone.run(() => this.chat.push(`${message.from}: ${message.payload}`));
            }
        }));
    }
}
