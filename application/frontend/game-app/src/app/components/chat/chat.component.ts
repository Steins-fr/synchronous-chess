import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { CommonModule } from '@angular/common';
import {
    Component,
    NgZone,
    ViewChild,
    OnInit,
    AfterViewInit,
    inject,
    DestroyRef,
    effect,
    Signal,
    WritableSignal,
    signal,
    ChangeDetectionStrategy
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Player } from '@app/classes/player/player';
import { RoomServiceMessage } from '@app/classes/webrtc/messages/room-service-message';
import { ChatMessageComponent, ChatMessage } from '@app/components/chat/chat-message/chat-message.component';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';
import { ChatParticipantComponent } from '@app/components/chat/chat-participant/chat-participant.component';

export enum ChatMessengerType {
    CHAT_MESSAGE = 'chatMessage',
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
        ChatParticipantComponent,
        ChatMessageComponent,
    ],
    styleUrls: ['./chat.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements OnInit, AfterViewInit {

    @ViewChild(CdkVirtualScrollViewport) public virtualScrollViewport!: CdkVirtualScrollViewport;
    public sendInput: string = '';
    protected chatMessages: WritableSignal<ChatMessage[]> = signal([], { });
    protected newMessage: number = 0;
    protected viewingHistory: WritableSignal<boolean> = signal(false);
    protected isSending: boolean = false;

    private readonly destroyRef = inject(DestroyRef);
    private readonly roomService: BlockRoomService<RoomServiceMessage<ChatMessengerType, string>> = inject(BlockRoomService<RoomServiceMessage<ChatMessengerType, string>>);
    private readonly ngZone = inject(NgZone);

    protected readonly roomIsActive: Signal<boolean> = toSignal(this.roomService.isActive, { initialValue: false });
    protected readonly players: Signal<Player[]> = toSignal(this.roomService.players$, { initialValue: [] });
    protected readonly queuingPlayers: Signal<string[]> = toSignal(this.roomService.queue$, { initialValue: [] });
    private readonly messengerSignal: Signal<RoomServiceMessage<ChatMessengerType, string> | null> = toSignal(this.roomService.messenger(Object.values(ChatMessengerType)), { initialValue: null });

    public constructor() {
        effect(() => {
            const message = this.messengerSignal();
            if (message) {
                this.onChatMessage(message);
            }
        }, { allowSignalWrites: true });
    }

    public ngOnInit(): void {
        this.ngZone.onMicrotaskEmpty.asObservable()
            .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            this.scrollDown();
        });
    }

    public ngAfterViewInit(): void {
        this.scrollDown();

        this.virtualScrollViewport.elementScrolled().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            const isViewingHistory: boolean = this.virtualScrollViewport.measureScrollOffset('bottom') > 0;
            if (this.viewingHistory() !== isViewingHistory) {
                this.newMessage = 0;
                this.viewingHistory.set(isViewingHistory);
            }
        });
    }

    public get roomName(): string {
        return this.roomService.roomName;
    }

    public get localPlayer(): Player {
        return this.roomService.localPlayer;
    }

    protected scrollDown(forced: boolean = false): void {
        if ((this.newMessage && !this.viewingHistory()) || forced) {
            this.newMessage = 0;
            this.virtualScrollViewport.scrollTo({ bottom: 0 });
        }
    }

    protected sendMessage(): void {
        if (this.roomService.isReady()) {
            this.roomService.transmitMessage(ChatMessengerType.CHAT_MESSAGE, this.sendInput);
            this.isSending = true;
        }
    }

    private onChatMessage(message: RoomServiceMessage<ChatMessengerType, string>): void {
        this.newMessage += 1;

        if (this.roomService.localPlayer?.name === message.from) {
            this.sendInput = '';
            this.isSending = false;
        }

        this.chatMessages.update(chatMessages => chatMessages.concat({
            author: message.from,
            message: message.payload,
            isSelf: this.localPlayer.name === message.from
        }));
    }
}
