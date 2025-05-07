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
    WritableSignal,
    signal,
    ChangeDetectionStrategy,
    Input, OnChanges, SimpleChanges
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Player } from '@app/classes/player/player';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { ChatMessageComponent, ChatMessage } from '@app/components/chat/chat-message/chat-message.component';
import { ChatParticipantComponent } from '@app/components/chat/chat-participant/chat-participant.component';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subscription } from 'rxjs';

export enum ChatMessengerType {
    CHAT_MESSAGE = 'chatMessage',
}

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
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
export class ChatComponent implements OnInit, OnChanges, AfterViewInit {
    private readonly destroyRef = inject(DestroyRef);
    private readonly ngZone = inject(NgZone);

    @Input({ required: true }) room: Room<RoomMessage<ChatMessengerType, string>> | undefined;

    protected get currentRoom(): Room<RoomMessage<ChatMessengerType, string>> {
        if (!this.room) {
            throw new Error('Room not found');
        }

        return this.room;
    }

    @ViewChild(CdkVirtualScrollViewport) public virtualScrollViewport!: CdkVirtualScrollViewport;
    public sendInput: string = '';
    protected newMessage: number = 0;
    protected isSending: boolean = false;
    protected readonly chatMessages: WritableSignal<ChatMessage[]> = signal([]);
    protected readonly viewingHistory: WritableSignal<boolean> = signal(false);
    protected readonly players: WritableSignal<Player[]> = signal([]);
    protected readonly queuingPlayers: WritableSignal<string[]> = signal([]);
    private readonly messengerSignal: WritableSignal<RoomMessage<ChatMessengerType, string> | null> = signal(null);
    private roomSubscriptions: Subscription[] = [];

    public constructor() {
        effect(() => {
            const message = this.messengerSignal();
            if (message) {
                this.onChatMessage(message);
            }
        });
    }

    public ngOnInit(): void {
        // FIXME: Rework with virtual scroll inversed
        this.ngZone.onMicrotaskEmpty.asObservable()
            .pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
            this.scrollDown();
        });
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['room']) {
            this.roomSubscriptions.forEach(sub => sub.unsubscribe());
            this.roomSubscriptions = [];

            if (this.room) {
                this.roomSubscriptions.push(
                    this.currentRoom.players$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((players: Player[]) => {
                        this.players.set(players);
                    }),
                    this.currentRoom.queue$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queue: string[]) => {
                        this.queuingPlayers.set(queue);
                    }),
                    this.currentRoom.messenger(ChatMessengerType.CHAT_MESSAGE).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((message: RoomMessage<ChatMessengerType, string>) => {
                        this.messengerSignal.set(message);
                    })
                );
            }
        }
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
        return this.currentRoom.roomName;
    }

    public get localPlayer(): Player {
        return this.currentRoom.localPlayer;
    }

    protected scrollDown(forced: boolean = false): void {
        if ((this.newMessage && !this.viewingHistory()) || forced) {
            this.newMessage = 0;
            this.virtualScrollViewport.scrollTo({ bottom: 0 });
        }
    }

    protected sendMessage(): void {
        this.currentRoom.transmitMessage(ChatMessengerType.CHAT_MESSAGE, this.sendInput);
        this.isSending = true;
    }

    private onChatMessage(message: RoomMessage<ChatMessengerType, string>): void {
        this.newMessage += 1;

        if (this.currentRoom.localPlayer?.name === message.from) {
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
