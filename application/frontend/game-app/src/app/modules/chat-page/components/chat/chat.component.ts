import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';

import {
    Component,
    DestroyRef,
    afterEveryRender,
    afterNextRender,
    effect,
    inject,
    input,
    signal,
    viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatFormField } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subscription } from 'rxjs';
import { ChatParticipantComponent } from './chat-participant/chat-participant.component';
import { ChatMessage, ChatMessageComponent } from './chat-message/chat-message.component';

export enum ChatMessengerType {
    CHAT_MESSAGE = 'chatMessage',
}

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    imports: [
        ChatParticipantComponent,
        ChatMessageComponent,
        MatChip,
        MatChipSet,
        MatFormField,
        MatInput,
        MatButton,
        ScrollingModule,
        ReactiveFormsModule,
    ],
    styleUrls: ['./chat.component.scss'],
})
export class ChatComponent {
    private readonly destroyRef = inject(DestroyRef);

    public readonly room = input.required<Room<RoomMessage<ChatMessengerType, string>> | undefined>();
    public readonly virtualScrollViewport = viewChild.required(CdkVirtualScrollViewport);

    protected get currentRoom(): Room<RoomMessage<ChatMessengerType, string>> {
        const room = this.room();
        if (!room) {
            throw new Error('Room not found');
        }

        return room;
    }

    protected readonly sendInput = new FormControl<string>('');
    protected readonly newMessage = signal<number>(0);
    protected readonly isSending = signal<boolean>(false);
    protected readonly chatMessages = signal<ChatMessage[]>([]);
    protected readonly viewingHistory = signal<boolean>(false);
    protected readonly players = signal<Player[]>([]);
    protected readonly queuingPlayers = signal<string[]>([]);
    private readonly messengerSignal = signal<RoomMessage<ChatMessengerType, string> | null>(null);
    private roomSubscriptions: Subscription[] = [];

    public constructor() {
        effect(() => {
            const message = this.messengerSignal();
            if (message) {
                this.onChatMessage(message);
            }
        });

        effect(() => {
            const room = this.room();

            this.roomSubscriptions.forEach(sub => sub.unsubscribe());
            this.roomSubscriptions = [];

            if (room) {
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
        });

        effect(() => {
            const isSending = this.isSending();
            if (isSending) {
                this.sendInput.disable();
            } else {
                this.sendInput.enable();
            }
        });

        afterNextRender({
            write: () => {
                this.scrollDown();

                this.virtualScrollViewport().elementScrolled().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
                    const isViewingHistory: boolean = this.virtualScrollViewport().measureScrollOffset('bottom') > 0;
                    if (this.viewingHistory() !== isViewingHistory) {
                        this.newMessage.set(0);
                        this.viewingHistory.set(isViewingHistory);
                    }
                });
            },
        });

        afterEveryRender({
            write: () => {
                this.scrollDown();
            },
        });
    }

    public get roomName(): string {
        return this.currentRoom.roomName;
    }

    public get localPlayer(): Player {
        return this.currentRoom.localPlayer;
    }

    protected scrollDown(forced: boolean = false): void {
        if ((this.newMessage() && !this.viewingHistory()) || forced) {
            this.newMessage.set(0);
            this.virtualScrollViewport().scrollTo({ bottom: 0 });
        }
    }

    protected sendMessage(): void {
        this.currentRoom.transmitMessage(ChatMessengerType.CHAT_MESSAGE, this.sendInput.value);
        this.isSending.set(true);
    }

    private onChatMessage(message: RoomMessage<ChatMessengerType, string>): void {
        this.newMessage.update(value => value + 1);

        if (this.currentRoom.localPlayer?.name === message.from) {
            this.sendInput.reset('');
            this.isSending.set(false);
        }

        this.chatMessages.update(chatMessages => chatMessages.concat({
            author: message.from,
            message: message.payload,
            isSelf: this.localPlayer.name === message.from
        }));
    }
}
