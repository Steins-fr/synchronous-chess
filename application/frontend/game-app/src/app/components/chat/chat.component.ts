import { Component, OnDestroy, NgZone, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { RoomServiceMessage } from '../../classes/webrtc/messages/room-service-message';

import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { BlockRoomService } from '../../services/room/block-room/block-room.service';
import { RoomService } from '../../services/room/room.service';

enum ChatMessageType {
    CHAT = 'chat'
}

interface ChatEntry {
    author: string;
    message: string;
}

type ChatMessage = string;

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnDestroy, OnInit, AfterViewInit {

    @ViewChild(CdkVirtualScrollViewport) public virtualScrollViewport?: CdkVirtualScrollViewport;
    private readonly subs: Subscription[] = [];
    public sendInput: string = '';
    public chat: ChatEntry[] = [];
    public newMessage: number = 0;
    public viewingHistory: boolean = false;
    public isSending: boolean = false;

    public constructor(
        public roomService: BlockRoomService,
        private readonly ngZone: NgZone) {
    }

    public ngOnInit(): void {
        this.subs.push(this.ngZone.onMicrotaskEmpty.asObservable()
            .subscribe(() => {
                this.scrollDown();
            }));
        this.roomService.notifier.follow(ChatMessageType.CHAT, this, this.onChatMessage.bind(this));
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
        this.roomService.notifier.unfollow(ChatMessageType.CHAT, this);
        this.roomService.clear();
    }

    public sendMessage(): void {
        if (this.roomService.isReady()) {
            this.roomService.transmitMessage(ChatMessageType.CHAT, this.sendInput);
            this.isSending = true;
        }
    }

    private onChatMessage(message: RoomServiceMessage<ChatMessageType, ChatMessage>): void {
        this.newMessage += 1;

        if (this.roomService.localPlayer.name === message.from) {
            this.sendInput = '';
            this.isSending = false;
        }

        this.ngZone.run(() => this.chat = [...this.chat, {
            author: message.from,
            message: message.payload
        }]);
    }
}
