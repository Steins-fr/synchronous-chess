import { computed, signal } from '@angular/core';
import { ChatEntryKind, ChatMessage, ChatMessageState } from '@app/modules/chat-page/components/chat/chat-message/chat-message.component';
import {
    PrivateComposerWait,
    PrivateConversations,
    PrivateConversationView,
    PrivateLine,
    PrivateLineKind
} from '@app/modules/private-conversations/classes/private-conversations';
import { TestHelper } from '@testing/test.helper';
import { vi } from 'vitest';

/**
 * The private conversations of alice, as the spec sets them: the conversations of the player, why its composer waits,
 * until when it sends too many messages
 */
export class PrivateConversationsMock implements Pick<PrivateConversations, 'localName' | 'watchedOnly' | 'waitUntil' | 'composerWait' | 'send' | 'retry'> {
    public readonly localName: string = 'alice';
    public readonly shown = signal<ReadonlyArray<Readonly<PrivateConversationView>>>([]);
    public readonly watchedOnly = computed<boolean>(() => this.shown().length > 0
        && this.shown().every((conversation: Readonly<PrivateConversationView>) => conversation.watched === true));
    public readonly wait = signal<PrivateComposerWait | undefined>(undefined);
    public readonly until = signal<number | undefined>(undefined);
    public readonly send = vi.fn<PrivateConversations['send']>().mockReturnValue(true);
    public readonly retry = vi.fn<PrivateConversations['retry']>().mockReturnValue(true);

    /** As the component reads it */
    public get conversations(): PrivateConversations {
        return TestHelper.cast<PrivateConversations>(this);
    }

    public waitUntil(now: number): number | undefined {
        const until: number | undefined = this.until();
        return until !== undefined && until > now ? until : undefined;
    }

    public composerWait(_id: string, now: number): PrivateComposerWait | undefined {
        return this.waitUntil(now) === undefined ? this.wait() : PrivateComposerWait.RATE;
    }
}

let lineIds: number = 0;

/** A message of a conversation, of the local player when alice wrote it, received live unless told */
export function privateMessage(author: string, text: string, options: Partial<ChatMessage> & { readonly live?: boolean } = {}): PrivateLine {
    const { live = true, ...overrides } = options;
    return {
        kind: PrivateLineKind.MESSAGE,
        live,
        message: {
            kind: ChatEntryKind.MESSAGE, id: ++lineIds, messageId: crypto.randomUUID(), author, text, isSelf: author === 'alice', at: Date.now(),
            state: ChatMessageState.SENT, ...overrides,
        },
    };
}

export function privateNotice(kind: PrivateLineKind.FLOOD | PrivateLineKind.UNREADABLE, name: string): PrivateLine {
    return { kind, id: ++lineIds, name, at: Date.now(), live: true };
}

/**
 * A conversation shown to alice, titled by the key test.{id}, which the spec translates: alice writes in it when it is a
 * member, else it reads a watched one
 */
export function privateConversation(id: string, members: ReadonlyArray<string>, lines: ReadonlyArray<PrivateLine> = [], open: boolean = true,
    watched: boolean = false): PrivateConversationView {
    return { id, members, title: { key: `test.${ id }` }, open, lines, missingKeys: [], member: members.includes('alice'), ...(watched ? { watched } : {}) };
}
