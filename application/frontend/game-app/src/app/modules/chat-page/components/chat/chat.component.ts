import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';

import {
    Component,
    DestroyRef,
    afterEveryRender,
    afterNextRender,
    computed,
    inject,
    input,
    signal,
    viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { disabled, form } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { EMPTY, switchMap } from 'rxjs';
import { ChatParticipantComponent } from './chat-participant/chat-participant.component';
import { ChatMessage, ChatMessageComponent } from './chat-message/chat-message.component';

export enum ChatMessengerType {
    CHAT_MESSAGE = 'chatMessage',
}

export interface ChatPayloads {
    [ChatMessengerType.CHAT_MESSAGE]: string;
}

// The chat has its own block chain, so its activity never delays the messages of another chain sharing the room
export const chatBlockChains: BlockChainRouting<ChatPayloads> = {
    [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT,
};

type ChatRoomMessage = AppMessage<ChatMessengerType.CHAT_MESSAGE, string>;

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    imports: [
        ChatParticipantComponent,
        ChatMessageComponent,
        MatChip,
        MatChipSet,
        TextFieldComponent,
        MatButton,
        ScrollingModule,
    ],
    styleUrls: ['./chat.component.scss'],
})
export class ChatComponent {
    private readonly destroyRef = inject(DestroyRef);

    public readonly room = input.required<Room<ChatPayloads> | undefined>();
    public readonly virtualScrollViewport = viewChild.required(CdkVirtualScrollViewport);

    protected get currentRoom(): Room<ChatPayloads> {
        const room = this.room();
        if (!room) {
            throw new Error('Room not found');
        }

        return room;
    }

    protected readonly message = signal<string>('');
    protected readonly newMessage = signal<number>(0);
    protected readonly isSending = signal<boolean>(false);
    // Disabled while the message sent is not received back
    protected readonly messageForm = form(this.message, (path) => {
        disabled(path, { when: () => this.isSending() });
    }, { name: 'chat-message' });
    protected readonly chatMessages = signal<ReadonlyArray<Readonly<ChatMessage>>>([]);
    protected readonly viewingHistory = signal<boolean>(false);
    protected readonly players = computed<ReadonlyArray<Readonly<Player>>>(() => this.room()?.players() ?? []);
    protected readonly queuingPlayers = computed<ReadonlyArray<string>>(() => this.room()?.queue() ?? []);

    public constructor() {
        // Handled in the subscription, a signal would only keep the last of several messages received in a row
        toObservable(this.room).pipe(
            switchMap(room => room?.messenger(ChatMessengerType.CHAT_MESSAGE) ?? EMPTY),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((message: ChatRoomMessage) => this.onChatMessage(message));

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
        this.currentRoom.transmitMessage(ChatMessengerType.CHAT_MESSAGE, this.message());
        this.isSending.set(true);
    }

    private onChatMessage(message: ChatRoomMessage): void {
        this.newMessage.update(value => value + 1);

        if (this.currentRoom.localPlayer.name === message.from) {
            this.message.set('');
            this.isSending.set(false);
        }

        this.chatMessages.update(chatMessages => chatMessages.concat({
            author: message.from,
            message: message.payload,
            isSelf: this.localPlayer.name === message.from
        }));
    }
}
