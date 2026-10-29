import {
    Component,
    DestroyRef,
    ElementRef,
    Signal,
    afterEveryRender,
    afterNextRender,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
    viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, maxLength, SchemaPath, submit } from '@angular/forms/signals';
import { MatIconButton, MatButton } from '@angular/material/button';
import { MatChip, MatChipSet } from '@angular/material/chips';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { TextAreaFieldComponent } from '@app/modules/form/text-area-field/text-area-field.component';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { LanguageService } from '@app/services/language/language.service';
import { scopedKey } from '@app/services/language/scoped-key';
import { idGenerator } from '@app/helpers/id-generator.helper';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { switchMap, timer } from 'rxjs';
import { admitChatMessage, ChatAdmission, ChatFlood, NO_FLOOD } from './chat-flood';
import { ChatParticipantComponent } from './chat-participant/chat-participant.component';
import { ChatEntryKind, ChatMessage, ChatMessageComponent, ChatMessageState } from './chat-message/chat-message.component';

export enum ChatMessengerType {
    CHAT_MESSAGE = 'chatMessage',
}

/**
 * A message of the chat, with the time its author sent it: a page joining late shows when the history was written. Its
 * id stays the same when it is sent again: shown once, though the room delivers both
 */
export interface ChatText {
    readonly id: string;
    readonly text: string;
    readonly at: number;
}

/** A message of the chat from a peer, of the form the application sends: a time it formats, a text it holds, never blank */
export function isChatText(payload: unknown): payload is ChatText {
    const text: Partial<Record<keyof ChatText, unknown>> = (typeof payload === 'object' && payload !== null ? payload : {});
    return typeof text.id === 'string' && typeof text.text === 'string' && text.text.trim() !== '' && text.text.length <= CHAT_MESSAGE_MAX_LENGTH
        && typeof text.at === 'number' && Math.abs(text.at) <= LATEST_TIME;
}

export interface ChatPayloads {
    [ChatMessengerType.CHAT_MESSAGE]: ChatText;
}

// The chat has its own block chain, so its activity never delays the messages of another chain sharing the room
export const chatBlockChains: BlockChainRouting<ChatPayloads> = {
    [ChatMessengerType.CHAT_MESSAGE]: BlockChainName.CHAT,
};

type ChatRoomMessage = AppMessage<ChatMessengerType.CHAT_MESSAGE, ChatText>;

/** A player arriving in the room, leaving it, or sending too many messages */
export interface ChatNotice {
    readonly id: number;
    readonly kind: ChatEntryKind.ARRIVAL | ChatEntryKind.DEPARTURE | ChatEntryKind.FLOOD;
    readonly name: string;
    readonly at: number;
}

export type ChatEntry = ChatMessage | ChatNotice;

/** An entry shown in the log */
interface ChatLine {
    readonly entry: Readonly<ChatEntry>;
    /** A message after a notice, another author or a pause: its author and its time show above it */
    readonly startsGroup: boolean;
    /** The first message unread: the divider of the new messages shows above it */
    readonly firstUnread: boolean;
    /** The time shown above a group, unless the setting hides it */
    readonly time: string | undefined;
}

/** The longest message, in characters */
export const CHAT_MESSAGE_MAX_LENGTH: number = 1000;
// The farthest time from 1970 a date holds, in milliseconds: beyond, formatting it throws
const LATEST_TIME: number = 8.64e15;
/** A message: a too long one is refused, its error shown */
function chatMessageRules(path: SchemaPath<string>): void {
    maxLength(path, CHAT_MESSAGE_MAX_LENGTH, { message: scopedKey(TranslationScope.CHAT, marker('composer.tooLong', undefined, 'chat')) });
}

/** Whether the log leaves an entry out: the messages of the authors the local player hides, and their floods, the arrivals and departures by the setting */
function isLeftOut(entry: Readonly<ChatEntry>, hiddenAuthors: ReadonlySet<string>, showArrivals: boolean): boolean {
    switch (entry.kind) {
        case ChatEntryKind.MESSAGE:
            return hiddenAuthors.has(entry.author);
        case ChatEntryKind.FLOOD:
            return hiddenAuthors.has(entry.name);
        default:
            return !showArrivals;
    }
}

// A pause longer than this starts a new group of messages, its time shown again
const GROUP_PAUSE: number = 5 * 60 * 1000;
// The log is at its bottom closer than this, in pixels: the new messages keep it there
const BOTTOM_MARGIN: number = 24;
// A message sent and not received back from the room after this delay failed: it may be sent again
const SEND_TIMEOUT: number = 15 * 1000;
// Safari ends the composition of a text before the keydown of the Enter confirming it, which no longer tells it composes
const COMPOSITION_END_DELAY: number = 100;

@Component({
    selector: 'app-chat',
    templateUrl: './chat.component.html',
    imports: [
        ChatParticipantComponent,
        ChatMessageComponent,
        MatChip,
        MatChipSet,
        MatIcon,
        MatIconButton,
        MatButton,
        MatMenu,
        MatMenuItem,
        MatMenuTrigger,
        MatDivider,
        TextAreaFieldComponent,
        TranslocoDirective,
    ],
    host: {
        class: 'flex flex-col min-h-0 bg-app-surface-raised text-app-text',
    },
})
export class ChatComponent {
    protected readonly kinds = ChatEntryKind;
    protected readonly preferences = inject(ChatPreferencesService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly languageService = inject(LanguageService);

    /** The room of the chat, which lives with it */
    public readonly room = input.required<Room<ChatPayloads>>();
    /** Whether the chat is shown: the messages received while it is not are unread */
    public readonly open = input<boolean>(true);
    /** The chat shows a button closing it */
    public readonly closable = input<boolean>(false);
    public readonly closed = output<void>();

    private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');

    protected readonly message = signal<string>('');
    protected readonly messageForm = form(this.message, chatMessageRules, { name: 'chat-message' });
    // Not a rule of the schema (requiredText): its error would show under the composer emptied and left, which no messaging
    // app does. A blank message is never sent, Send disabled meanwhile
    protected readonly isBlank = computed<boolean>(() => this.message().trim() === '');

    private readonly entries = signal<ReadonlyArray<Readonly<ChatEntry>>>([]);
    /** The players whose messages the local player hides */
    protected readonly hiddenAuthors = signal<ReadonlySet<string>>(new Set());
    // The messages of the others received while the chat was closed, or scrolled up
    private readonly unreadIds = signal<ReadonlySet<number>>(new Set());
    /** The messages of the others received while the chat was closed, or scrolled up, not read yet: the ones shown */
    public readonly unread: Signal<number> = computed<number>(() => {
        const unreadIds: ReadonlySet<number> = this.unreadIds();
        const hidden: ReadonlySet<string> = this.hiddenAuthors();
        return this.entries().filter((entry: Readonly<ChatEntry>) =>
            entry.kind === ChatEntryKind.MESSAGE && unreadIds.has(entry.id) && !hidden.has(entry.author)).length;
    });
    private readonly _unreadReceived = signal<number>(0);
    /** The messages of the others received unread, since the chat shows: a new one rings the button opening the chat */
    public readonly unreadReceived: Signal<number> = this._unreadReceived.asReadonly();
    private readonly firstUnreadId = signal<number | undefined>(undefined);
    protected readonly atBottom = signal<boolean>(true);

    protected readonly players = computed<ReadonlyArray<Readonly<Player>>>(() => this.room().players());
    protected readonly otherPlayers = computed<ReadonlyArray<Readonly<Player>>>(() => this.players().filter((player: Readonly<Player>) => !player.isLocal));
    protected readonly queuingPlayers = computed<ReadonlyArray<string>>(() => this.room().queue());
    private readonly timeFormat = computed<Intl.DateTimeFormat>(() => new Intl.DateTimeFormat(this.languageService.language(), { timeStyle: 'short' }));

    protected readonly lines = computed<ReadonlyArray<Readonly<ChatLine>>>(() => {
        const hidden: ReadonlySet<string> = this.hiddenAuthors();
        const showArrivals: boolean = this.preferences.arrivals.on();
        const timeFormat: Intl.DateTimeFormat | undefined = this.preferences.times.on() ? this.timeFormat() : undefined;
        const firstUnreadId: number | undefined = this.firstUnreadId();
        const lines: ChatLine[] = [];
        let previous: Readonly<ChatEntry> | undefined;
        // The divider above the first message unread, or the next one shown when its author is hidden
        let dividerShown: boolean = firstUnreadId === undefined;

        for (const entry of this.entries()) {
            if (isLeftOut(entry, hidden, showArrivals)) {
                continue;
            }
            const firstUnread: boolean = !dividerShown && entry.kind === ChatEntryKind.MESSAGE && entry.id >= (firstUnreadId as number);
            dividerShown ||= firstUnread;
            const startsGroup: boolean = entry.kind === ChatEntryKind.MESSAGE && (firstUnread || previous?.kind !== ChatEntryKind.MESSAGE
                || previous.author !== entry.author || entry.at - previous.at > GROUP_PAUSE);
            lines.push({ entry, startsGroup, firstUnread, time: startsGroup ? timeFormat?.format(entry.at) : undefined });
            previous = entry;
        }

        return lines;
    });

    /** The local player, whose own messages hidden for flooding are told apart */
    protected readonly localName = computed<string>(() => this.room().localPlayer.name);

    private readonly ids: Generator<number, never> = idGenerator();
    /** The rate of the authors on the chain */
    private flood: ChatFlood = NO_FLOOD;
    /** The authors reported for an invalid message: their first one only, the same on every page, rather than a report per message */
    private readonly invalidAuthors = new Set<string>();
    private compositionEndedAt: number = Number.NEGATIVE_INFINITY;
    // Where the log scrolls once rendered: to its bottom, or to the divider of the new messages
    private scrollTarget: 'bottom' | 'unread' | undefined;
    // The room shown, the players seen in it, and the ones who left it: back, they arrive again
    private knownRoom: Room<ChatPayloads> | undefined;
    private seenPlayers = new Set<string>();
    private departed = new Set<string>();

    public constructor() {
        // Handled in the subscription, a signal would only keep the last of several messages received in a row
        toObservable(this.room).pipe(
            switchMap((room: Room<ChatPayloads>) => room.messenger(ChatMessengerType.CHAT_MESSAGE)),
            takeUntilDestroyed(),
        ).subscribe((message: ChatRoomMessage) => this.onChatMessage(message));

        // A player the room agrees left: a participant losing its link to it may connect to it again meanwhile
        toObservable(this.room).pipe(
            switchMap((room: Room<ChatPayloads>) => room.departed$),
            takeUntilDestroyed(),
        ).subscribe((name: string) => this.onDeparted(name));

        effect(() => {
            const room: Room<ChatPayloads> = this.room();
            const players: ReadonlyArray<Readonly<Player>> = this.players();
            untracked(() => this.noticeArrivals(room, players));
        });

        // Opened, the chat shows the new messages from the first one; closed, it forgets the ones it showed
        effect(() => {
            const open: boolean = this.open();
            untracked(() => {
                if (open) {
                    this.scrollTarget = this.firstUnreadId() === undefined ? 'bottom' : 'unread';
                } else if (this.unread() === 0) {
                    this.firstUnreadId.set(undefined);
                }
            });
        });

        afterEveryRender({
            write: () => this.scroll(),
        });

        // The log shrunk, under the composer grown or the keyboard of a phone: at its bottom, it stays there
        afterNextRender(() => {
            const observer = new ResizeObserver(() => this.keepBottom());
            observer.observe(this.log().nativeElement);
            this.destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    protected send(): void {
        if (this.isBlank()) {
            return;
        }

        void submit(this.messageForm, {
            action: () => {
                this.transmit(this.message().trim());
                this.message.set('');
                this.messageForm().reset();
                return Promise.resolve(undefined);
            },
        });
    }

    /** Sends again a message the room did not send back in time, under the same id */
    protected retry(failed: Readonly<ChatMessage>): void {
        this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) => entries.filter((entry: Readonly<ChatEntry>) => entry !== failed));
        this.transmit(failed.text, failed.messageId);
    }

    protected onCompositionEnd(event: CompositionEvent): void {
        this.compositionEndedAt = event.timeStamp;
    }

    /** Enter sends the message, or a new line by the setting: Shift starts a new line, Ctrl or Cmd sends */
    protected onComposerKey(event: KeyboardEvent): void {
        // A key typing an accent or an ideogram belongs to the text being composed, the Enter confirming it included
        const composing: boolean = event.isComposing || event.timeStamp - this.compositionEndedAt < COMPOSITION_END_DELAY;
        if (event.key !== 'Enter' || composing || event.shiftKey) {
            return;
        }
        if (event.ctrlKey || event.metaKey || this.preferences.enterSends.on()) {
            event.preventDefault();
            this.send();
        }
    }

    protected onScroll(): void {
        this.measureBottom();
    }

    protected scrollToLatest(): void {
        this.scrollTarget = 'bottom';
        this.scroll();
    }

    protected toggleAuthor(name: string): void {
        this.hiddenAuthors.update((hidden: ReadonlySet<string>) => {
            const toggled = new Set<string>(hidden);
            if (!toggled.delete(name)) {
                toggled.add(name);
            }
            return toggled;
        });
    }

    /** Shows the message at once, waiting until the room sends it back: failed after a while */
    private transmit(text: string, messageId: string = crypto.randomUUID()): void {
        const room: Room<ChatPayloads> = this.room();
        const message: ChatMessage = {
            kind: ChatEntryKind.MESSAGE, id: this.ids.next().value, messageId, author: room.localPlayer.name, text, isSelf: true, at: Date.now(),
            state: ChatMessageState.SENDING,
        };
        this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) => entries.concat(message));
        // Its own message read the others: back to the latest
        this.markRead();
        this.firstUnreadId.set(undefined);
        this.scrollTarget = 'bottom';
        room.transmitMessage(ChatMessengerType.CHAT_MESSAGE, { id: messageId, text, at: message.at });

        timer(SEND_TIMEOUT).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) =>
            entries.map((entry: Readonly<ChatEntry>) => (entry === message ? { ...message, state: ChatMessageState.FAILED } : entry))));
    }

    private onChatMessage(message: ChatRoomMessage): void {
        const room: Room<ChatPayloads> = this.room();
        // Checked where it enters: a peer cheating would break the log of everyone, its history included
        if (!isChatText(message.payload)) {
            if (!this.invalidAuthors.has(message.from)) {
                this.invalidAuthors.add(message.from);
                room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            }
            return;
        }
        const { id: messageId, text, at } = message.payload;
        const isSelf: boolean = message.from === room.localPlayer.name;
        const shown: Readonly<ChatEntry> | undefined = this.entries().find((entry: Readonly<ChatEntry>) =>
            entry.kind === ChatEntryKind.MESSAGE && entry.author === message.from && entry.messageId === messageId);
        // Sent twice, the room delivering the first one late: shown once
        if (shown?.kind === ChatEntryKind.MESSAGE && shown.state === ChatMessageState.SENT) {
            return;
        }
        if (!this.isAdmitted(message)) {
            // Its own message, waiting or failed: hidden from every page, sending it again would be too
            this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) => entries.filter((other: Readonly<ChatEntry>) => other !== shown));
            return;
        }

        const entry: ChatMessage = {
            kind: ChatEntryKind.MESSAGE, id: this.ids.next().value, messageId, author: message.from, text, isSelf, at, state: ChatMessageState.SENT,
        };
        if (this.open() && this.atBottom()) {
            this.scrollTarget = 'bottom';
        } else if (!isSelf && !this.hiddenAuthors().has(message.from) && !room.isHistory(message)) {
            // The first one unread since the last ones were read: the divider moves above it
            if (this.unread() === 0) {
                this.firstUnreadId.set(entry.id);
            }
            this.unreadIds.update((unreadIds: ReadonlySet<number>) => new Set(unreadIds).add(entry.id));
            this._unreadReceived.update((received: number) => received + 1);
        }
        // Its own message back from the room, still waiting or failed already: sent, moved where the room put it among the others
        this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) =>
            entries.filter((other: Readonly<ChatEntry>) => other !== shown).concat(entry));
    }

    /**
     * Whether a message shows, by the rate of its author on the chain: every page hides the same ones, the history
     * included. The first one hidden is told once. A room without chain times nothing: its messages show
     */
    private isAdmitted(message: ChatRoomMessage): boolean {
        const time: number | undefined = this.room().sequencedAt(message);
        if (time === undefined) {
            return true;
        }

        const admission: ChatAdmission = admitChatMessage(this.flood, message.from, time);
        this.flood = admission.flood;
        if (admission.notice) {
            this.notice([{ id: this.ids.next().value, kind: ChatEntryKind.FLOOD, name: message.from, at: message.payload.at }]);
        }
        return admission.shown;
    }

    /**
     * The players arriving in the room. The participants of a room connect to a player joining it: the ones the local
     * player connects to itself were there already, and a participant connecting again to another one never left
     */
    private noticeArrivals(room: Room<ChatPayloads>, players: ReadonlyArray<Readonly<Player>>): void {
        const names: ReadonlyArray<string> = players.map((player: Readonly<Player>) => player.name);
        if (room !== this.knownRoom) {
            this.knownRoom = room;
            this.seenPlayers = new Set<string>(names);
            this.departed = new Set<string>();
            return;
        }

        const arrivals: ReadonlyArray<string> = players.filter((player: Readonly<Player>) => this.departed.has(player.name)
            || (!this.seenPlayers.has(player.name) && player instanceof WebRtcPlayer && player.initiated)).map((player: Readonly<Player>) => player.name);
        names.forEach((name: string) => this.seenPlayers.add(name));
        arrivals.forEach((name: string) => this.departed.delete(name));
        this.notice(arrivals.map((name: string) => ({ id: this.ids.next().value, kind: ChatEntryKind.ARRIVAL, name, at: Date.now() })));
    }

    private onDeparted(name: string): void {
        this.departed.add(name);
        // Its messages shown again: gone from the options, nothing else would show them
        if (this.hiddenAuthors().has(name)) {
            this.toggleAuthor(name);
        }
        this.notice([{ id: this.ids.next().value, kind: ChatEntryKind.DEPARTURE, name, at: Date.now() }]);
    }

    private notice(notices: ReadonlyArray<ChatNotice>): void {
        if (notices.length > 0) {
            if (this.open() && this.atBottom()) {
                this.scrollTarget = 'bottom';
            }
            this.entries.update((entries: ReadonlyArray<Readonly<ChatEntry>>) => entries.concat(notices));
        }
    }

    private scroll(): void {
        const target: 'bottom' | 'unread' | undefined = this.scrollTarget;
        if (target === undefined) {
            return;
        }
        this.scrollTarget = undefined;
        const log: HTMLElement = this.log().nativeElement;
        const divider: HTMLElement | null = target === 'unread' ? log.querySelector('#unread-divider') : null;
        // The divider a little below the top of the log, the message before it in view
        log.scrollTop = divider === null ? log.scrollHeight : divider.offsetTop - BOTTOM_MARGIN;
        this.measureBottom();
    }

    private keepBottom(): void {
        if (this.atBottom()) {
            const log: HTMLElement = this.log().nativeElement;
            log.scrollTop = log.scrollHeight;
        }
        this.measureBottom();
    }

    private measureBottom(): void {
        const log: HTMLElement = this.log().nativeElement;
        const atBottom: boolean = log.scrollHeight - log.scrollTop - log.clientHeight <= BOTTOM_MARGIN;
        this.atBottom.set(atBottom);
        if (atBottom && this.open()) {
            this.markRead();
        }
    }

    private markRead(): void {
        // Read already: the unread messages, and the badge reading them, are not computed again at each scroll
        if (this.unreadIds().size > 0) {
            this.unreadIds.set(new Set());
        }
    }
}
