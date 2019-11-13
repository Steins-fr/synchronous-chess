import { Component, OnDestroy, NgZone, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { RoomServiceMessage } from 'src/app/classes/webrtc/messages/room-service-message';

import { RoomService } from 'src/app/services/room/room.service';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

enum ChatMessageType {
    CHAT = 'chat'
}

interface ChatMessage {
    author: string;
    message: string;
}

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnDestroy, OnInit, AfterViewInit {

    @ViewChild(CdkVirtualScrollViewport, { static: false }) public virtualScrollViewport?: CdkVirtualScrollViewport;
    private readonly subs: Array<Subscription> = [];
    public sendInput: string = '';
    public chat: Array<ChatMessage> = [];
    public newMessage: number = 0;
    public viewingHistory: boolean = false;

    public constructor(
        public roomService: RoomService,
        private readonly ngZone: NgZone) {
        this.listenChat();
    }

    public ngOnInit(): void {
        this.subs.push(this.ngZone.onMicrotaskEmpty.asObservable()
            .subscribe(() => {
                this.scrollDown();
            }));
    }

    public ngAfterViewInit(): void {
        this.scrollDown();
        this.subs.push(this.virtualScrollViewport.elementScrolled().subscribe(() => {
            const isViewingHistory: boolean = this.virtualScrollViewport.measureScrollOffset('bottom') > 0;
            if (this.viewingHistory !== isViewingHistory) {
                this.newMessage = 0;
                this.ngZone.run(() => this.viewingHistory = isViewingHistory);
            }
        }));
    }

    public scrollDown(forced: boolean = false): void {
        if ((this.newMessage && !this.viewingHistory) || forced) {
            this.newMessage = 0;
            this.virtualScrollViewport.scrollTo({ bottom: 0 });
        }
    }

    public ngOnDestroy(): void {
        this.subs.forEach((sub: Subscription) => sub.unsubscribe());
        this.roomService.clear();
    }

    public sendMessage(): void {
        if (this.roomService.isReady()) {
            this.roomService.transmitMessage(ChatMessageType.CHAT, this.sendInput);
            this.newMessage += 1;
            this.chat = [...this.chat, {
                author: this.roomService.localPlayer.name,
                message: this.sendInput
            }];
            this.sendInput = '';
        }
    }

    private listenChat(): void {
        this.subs.push(this.roomService.onMessage.subscribe((message: RoomServiceMessage<ChatMessageType>) => {
            if (message.type === ChatMessageType.CHAT) {
                this.newMessage += 1;
                this.ngZone.run(() => this.chat = [...this.chat, {
                    author: message.from,
                    message: message.payload
                }]);
            }
        }));
    }
}
