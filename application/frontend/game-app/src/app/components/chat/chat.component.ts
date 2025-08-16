import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, NgZone, ViewChild, OnInit, AfterViewInit, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RoomServiceMessage } from '@app/classes/webrtc/messages/room-service-message';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';
import { ParticipantComponent } from './participant/participant.component';

export enum ChatMessageType {
    CHAT = 'chat'
}

interface ChatEntry {
    author: string;
    message: string;
}

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    standalone: true,
    imports: [
        CommonModule,
        ScrollingModule,
        MatButtonModule,
        MatChipsModule,
        FormsModule,
        MatFormFieldModule,
        MatInputModule,
        ParticipantComponent,
    ],
    styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnDestroy, OnInit, AfterViewInit {

    @ViewChild(CdkVirtualScrollViewport) public virtualScrollViewport!: CdkVirtualScrollViewport;
    public sendInput: string = '';
    public chat: ChatEntry[] = [];
    public newMessage: number = 0;
    public viewingHistory: boolean = false;
    public isSending: boolean = false;

    private readonly destroyRef = inject(DestroyRef);

    public constructor(
        public readonly roomService: BlockRoomService<RoomServiceMessage<ChatMessageType, string>>,
        private readonly ngZone: NgZone) {
    }

    public ngOnInit(): void {
        this.ngZone.onMicrotaskEmpty.asObservable()
            .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            this.scrollDown();
        });
        this.roomService.notifier.follow(ChatMessageType.CHAT, this, this.onChatMessage.bind(this));
    }

    public ngAfterViewInit(): void {
        this.scrollDown();

        this.virtualScrollViewport.elementScrolled().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            const isViewingHistory: boolean = this.virtualScrollViewport.measureScrollOffset('bottom') > 0;
            if (this.viewingHistory !== isViewingHistory) {
                this.newMessage = 0;
                this.ngZone.run(() => this.viewingHistory = isViewingHistory);
            }
        });
    }

    public scrollDown(forced: boolean = false): void {
        if ((this.newMessage && !this.viewingHistory) || forced) {
            this.newMessage = 0;
            this.virtualScrollViewport.scrollTo({ bottom: 0 });
        }
    }

    public ngOnDestroy(): void {
        this.roomService.notifier.unfollow(ChatMessageType.CHAT, this);
        this.roomService.clear();
    }

    public sendMessage(): void {
        if (this.roomService.isReady()) {
            this.roomService.transmitMessage(ChatMessageType.CHAT, this.sendInput);
            this.isSending = true;
        }
    }

    private onChatMessage(message: RoomServiceMessage<ChatMessageType, string>): void {
        this.newMessage += 1;

        if (this.roomService.localPlayer?.name === message.from) {
            this.sendInput = '';
            this.isSending = false;
        }

        this.ngZone.run(() => this.chat = [...this.chat, {
            author: message.from,
            message: message.payload
        }]);
    }
}
