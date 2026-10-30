import { Component, computed, inject, input, output } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { maskOffensiveWords, OffensiveWords } from '@app/services/offensive-words/offensive-words';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';
import { TranslocoPipe } from '@jsverse/transloco';

export enum ChatEntryKind {
    MESSAGE = 'message',
    ARRIVAL = 'arrival',
    DEPARTURE = 'departure',
    /** An author sending too many messages: they are hidden until its rate falls back */
    FLOOD = 'flood',
}

export enum ChatMessageState {
    /** Sent, not received back from the room yet */
    SENDING = 'sending',
    /** Not received back from the room in time: it may be sent again */
    FAILED = 'failed',
    SENT = 'sent',
}

export interface ChatMessage {
    readonly id: number;
    readonly kind: ChatEntryKind.MESSAGE;
    /** The id its author gave it, the same when sent again */
    readonly messageId: string;
    readonly author: string;
    readonly text: string;
    readonly isSelf: boolean;
    /** When its author sent it */
    readonly at: number;
    readonly state: ChatMessageState;
}

/** A message of the chat, in a bubble: the local player's on the right, the others' on the left */
@Component({
    selector: 'app-chat-message',
    imports: [MatButton, TranslocoPipe],
    templateUrl: './chat-message.component.html',
    host: {
        class: 'flex flex-col',
        '[class.items-end]': 'message().isSelf',
        '[class.items-start]': '!message().isSelf',
        '[class.mt-3]': 'startsGroup()',
        '[class.mt-0.5]': '!startsGroup()',
    },
})
export class ChatMessageComponent {
    private readonly preferences = inject(ChatPreferencesService);
    private readonly offensiveWords = inject(OffensiveWordsService);

    public readonly message = input.required<Readonly<ChatMessage>>();
    /** The first message of a group: its author and its time show above it */
    public readonly startsGroup = input<boolean>(true);
    /** The time shown above the group, none when the setting hides it */
    public readonly time = input<string>();
    /** Retry is disabled while the composer waits before sending another message */
    public readonly retryDisabled = input<boolean>(false);
    /** The local player sends a failed message again */
    public readonly retry = output<void>();

    protected readonly states = ChatMessageState;
    /**
     * The text shown, its offensive words masked while the setting hides them: computed once per message, the message
     * keeping its text as written, which Retry sends again
     */
    protected readonly text = computed<string>(() => {
        const text: string = this.message().text;
        const words: OffensiveWords | undefined = this.offensiveWords.words();
        return words !== undefined && this.preferences.hideOffensiveWords.on() ? maskOffensiveWords(text, words) : text;
    });
}
