import { afterEveryRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, linkedSignal, output, Signal, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, submit } from '@angular/forms/signals';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { chatMessageRules, GROUP_PAUSE } from '@app/modules/chat-page/components/chat/chat.component';
import { ChatComposerComponent } from '@app/modules/chat-page/components/chat/chat-composer/chat-composer.component';
import { ChatMessage, ChatMessageComponent } from '@app/modules/chat-page/components/chat/chat-message/chat-message.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { LanguageService } from '@app/services/language/language.service';
import { scopedKey } from '@app/services/language/scoped-key';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { Subscription, timer } from 'rxjs';
import {
    PrivateComposerWait,
    PrivateConversations,
    PrivateConversationView,
    PrivateLine,
    PrivateLineKind,
    PrivateNoticeLine
} from '../../classes/private-conversations';

/** A tab of a conversation, as the tabs order them */
interface PrivateTabState {
    readonly id: string;
    readonly open: boolean;
}

/** A tab of a conversation, as it shows */
interface PrivateTab {
    readonly view: Readonly<PrivateConversationView>;
    /** The messages of the others received live, not seen yet */
    readonly unread: number;
}

/** A line of the log of the conversation shown */
interface PrivateLogLine {
    readonly id: number;
    readonly message?: Readonly<ChatMessage>;
    readonly notice?: Readonly<PrivateNoticeLine>;
    /** A message after a notice, another author or a pause: its author and its time show above it */
    readonly startsGroup: boolean;
    /** The time shown above a group, unless the setting hides it */
    readonly time: string | undefined;
}

const sameTabs = (tabs: ReadonlyArray<Readonly<PrivateTabState>>, others: ReadonlyArray<Readonly<PrivateTabState>>): boolean =>
    tabs.length === others.length && tabs.every((tab: Readonly<PrivateTabState>, index: number) => tab.id === others[index].id && tab.open === others[index].open);

const lineId = (line: Readonly<PrivateLine>): number => (line.kind === PrivateLineKind.MESSAGE ? line.message.id : line.id);

/** A message of another participant received live: it may be unread, and ring */
const isReceived = (line: Readonly<PrivateLine>): boolean => line.kind === PrivateLineKind.MESSAGE && line.live && !line.message.isSelf;

/**
 * The private conversations of the local player, a tab each: the open ones first, then the closed ones, the latest
 * declared first. Each conversation keeps its draft: the selection never moves by itself while the composer holds one, a
 * text written to a team never sent to its opponent
 */
@Component({
    selector: 'app-private-conversations',
    templateUrl: './private-conversations.component.html',
    imports: [ChatComposerComponent, ChatMessageComponent, MatIcon, MatIconButton, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'flex flex-col min-h-0 bg-app-surface-raised text-app-text',
    },
})
export class PrivateConversationsComponent {
    protected readonly preferences = inject(ChatPreferencesService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly languageService = inject(LanguageService);
    private readonly soundService = inject(SoundService);
    private readonly pageVisibility = inject(PageVisibilityService);

    /** The private conversations of the room, the same for its life: the panel is created again with the next room */
    public readonly conversations = input.required<PrivateConversations>();
    /** Whether the panel is shown: the messages received while it is not are unread */
    public readonly open = input<boolean>(true);
    public readonly closed = output<void>();

    private readonly log = viewChild.required<ElementRef<HTMLElement>>('log');

    protected readonly lineKinds = PrivateLineKind;
    protected readonly localName = computed<string>(() => this.conversations().localName);
    private readonly views = computed<ReadonlyArray<Readonly<PrivateConversationView>>>(() => this.conversations().mine());
    // The order of the tabs: the open ones first, then the closed ones, the latest declared first. Not computed again for
    // a message received
    private readonly tabStates = computed<ReadonlyArray<Readonly<PrivateTabState>>>(() => {
        const latestFirst: ReadonlyArray<Readonly<PrivateTabState>> = this.views().map(({ id, open }: Readonly<PrivateConversationView>) => ({ id, open }))
            .reverse();
        return [...latestFirst.filter((tab: Readonly<PrivateTabState>) => tab.open), ...latestFirst.filter((tab: Readonly<PrivateTabState>) => !tab.open)];
    }, { equal: sameTabs });
    /**
     * The conversation selected: kept while it lasts, open, closed already when picked, or holding a draft; else the
     * first tab. It never moves by itself while the composer holds a draft
     */
    protected readonly selected = linkedSignal<ReadonlyArray<Readonly<PrivateTabState>>, string | undefined>({
        source: this.tabStates,
        computation: (tabs: ReadonlyArray<Readonly<PrivateTabState>>, previous?: { source: ReadonlyArray<Readonly<PrivateTabState>>; value: string | undefined }): string | undefined => {
            const kept: Readonly<PrivateTabState> | undefined = tabs.find((tab: Readonly<PrivateTabState>) => tab.id === previous?.value);
            const closedBefore: boolean = previous?.source.find((tab: Readonly<PrivateTabState>) => tab.id === kept?.id)?.open === false;
            if (kept !== undefined && (kept.open || closedBefore || untracked(this.message) !== '')) {
                return kept.id;
            }
            return tabs[0]?.id;
        },
    });
    protected readonly view = computed<Readonly<PrivateConversationView> | undefined>(() =>
        this.views().find((view: Readonly<PrivateConversationView>) => view.id === this.selected()));
    /** The other members of the conversation shown, its composer naming them */
    protected readonly recipients = computed<string>(() => (this.view()?.members ?? [])
        .filter((member: string) => member !== this.localName()).join(', '));

    // The latest line seen in each conversation
    private readonly seen = signal<ReadonlyMap<string, number>>(new Map());
    protected readonly tabs = computed<ReadonlyArray<Readonly<PrivateTab>>>(() => {
        const views: ReadonlyArray<Readonly<PrivateConversationView>> = this.views();
        const seen: ReadonlyMap<string, number> = this.seen();
        return this.tabStates().map(({ id }: Readonly<PrivateTabState>) => {
            const view: Readonly<PrivateConversationView> = views.find((other: Readonly<PrivateConversationView>) => other.id === id) as Readonly<PrivateConversationView>;
            const seenId: number = seen.get(id) ?? 0;
            return { view, unread: view.lines.filter((line: Readonly<PrivateLine>) => isReceived(line) && lineId(line) > seenId).length };
        });
    });
    /** The messages of the others received while their conversation was not shown, not read yet */
    public readonly unread: Signal<number> = computed<number>(() => this.tabs().reduce((count: number, tab: Readonly<PrivateTab>) => count + tab.unread, 0));
    private readonly _unreadReceived = signal<number>(0);
    /** The messages of the others received unread: a new one rings the button opening the panel */
    public readonly unreadReceived: Signal<number> = this._unreadReceived.asReadonly();

    private readonly timeFormat = computed<Intl.DateTimeFormat>(() => new Intl.DateTimeFormat(this.languageService.language(), { timeStyle: 'short' }));
    protected readonly lines = computed<ReadonlyArray<Readonly<PrivateLogLine>>>(() => {
        const timeFormat: Intl.DateTimeFormat | undefined = this.preferences.times.on() ? this.timeFormat() : undefined;
        let previous: Readonly<ChatMessage> | undefined;
        return (this.view()?.lines ?? []).map((line: Readonly<PrivateLine>) => {
            if (line.kind !== PrivateLineKind.MESSAGE) {
                previous = undefined;
                return { id: line.id, notice: line, startsGroup: false, time: undefined };
            }
            const message: Readonly<ChatMessage> = line.message;
            const startsGroup: boolean = previous?.author !== message.author || message.at - previous.at > GROUP_PAUSE;
            previous = message;
            return { id: message.id, message, startsGroup, time: startsGroup ? timeFormat?.format(message.at) : undefined };
        });
    });

    // The draft of the conversation shown, the ones of the others kept aside
    protected readonly message = signal<string>('');
    protected readonly messageForm = form(this.message, chatMessageRules, { name: 'private-message' });
    protected readonly isBlank = computed<boolean>(() => this.message().trim() === '');
    private readonly drafts = new Map<string | undefined, string>();

    // The time of the composer: set at each message sent, and at each second left to wait
    private readonly now = signal<number>(Date.now());
    private readonly waitUntil = computed<number | undefined>(() => this.conversations().waitUntil(this.now()));
    /** Why the composer does not send, none when it may */
    protected readonly wait = computed<PrivateComposerWait | undefined>(() => this.conversations().composerWait(this.selected() ?? '', this.now()));
    protected readonly hint = computed<TranslatableText | undefined>(() => {
        switch (this.wait()) {
            case PrivateComposerWait.CLOSED:
                return { key: scopedKey(TranslationScope.CHAT, marker('private.composer.closed', undefined, 'chat')) };
            case PrivateComposerWait.KEYS:
                return { key: scopedKey(TranslationScope.CHAT, marker('private.composer.preparing', undefined, 'chat')) };
            case PrivateComposerWait.RATE: {
                const seconds: number = Math.ceil(((this.waitUntil() as number) - this.now()) / 1000);
                return { key: scopedKey(TranslationScope.CHAT, marker('composer.wait', undefined, 'chat')), params: { seconds } };
            }
            case PrivateComposerWait.UNSENT:
                return { key: scopedKey(TranslationScope.CHAT, marker('composer.unsent', undefined, 'chat')) };
            default:
                return undefined;
        }
    });
    /** A failed message is sent again while the composer waits for its messages unsent only */
    protected readonly retryDisabled = computed<boolean>(() => this.wait() !== undefined && this.wait() !== PrivateComposerWait.UNSENT);

    // The latest line received, of every conversation: the ones after it are new
    private latestId: number = 0;
    // The latest line of the conversation shown: a new one scrolls the log to its bottom
    private shownLine: string | undefined;
    private scrollPending: boolean = false;

    public constructor() {
        // Another conversation shown: the draft of the former one kept aside, the one of the next one back
        let shownId: string | undefined;
        effect(() => {
            const id: string | undefined = this.selected();
            untracked(() => {
                this.drafts.set(shownId, this.message());
                this.message.set(this.drafts.get(id) ?? '');
                this.messageForm().reset();
                shownId = id;
            });
        });

        // The lines received: the ones of the conversation shown seen, the others unread, ringing
        effect(() => {
            const views: ReadonlyArray<Readonly<PrivateConversationView>> = this.views();
            const shown: string | undefined = this.open() ? this.selected() : undefined;
            untracked(() => this.receive(views, shown));
        });

        // The countdown of the composer waiting: its time ticks at each second left to wait, until it may send
        effect((onCleanup: (cleanup: () => void) => void) => {
            const waitUntil: number | undefined = this.waitUntil();
            if (waitUntil !== undefined) {
                const tick: Subscription = timer((waitUntil - this.now()) % 1000 || 1000).pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe(() => this.now.set(Date.now()));
                onCleanup(() => tick.unsubscribe());
            }
        });

        afterEveryRender({
            write: () => {
                if (this.scrollPending) {
                    this.scrollPending = false;
                    const log: HTMLElement = this.log().nativeElement;
                    log.scrollTop = log.scrollHeight;
                }
            },
        });
    }

    protected select(id: string): void {
        this.selected.set(id);
    }

    protected send(): void {
        this.now.set(Date.now());
        const id: string | undefined = this.selected();
        if (id === undefined || this.isBlank() || this.wait() !== undefined) {
            return;
        }

        void submit(this.messageForm, {
            action: () => {
                if (this.conversations().send(id, this.message())) {
                    this.message.set('');
                    this.messageForm().reset();
                }
                return Promise.resolve(undefined);
            },
        });
    }

    /** Sends again a message the room did not send back in time, under the same id */
    protected retry(failed: Readonly<ChatMessage>): void {
        this.now.set(Date.now());
        this.conversations().retry(this.selected() as string, failed.messageId);
    }

    private receive(views: ReadonlyArray<Readonly<PrivateConversationView>>, shown: string | undefined): void {
        const latestId: number = this.latestId;
        let received: boolean = false;
        let unseen: number = 0;
        for (const view of views) {
            for (const line of view.lines) {
                const id: number = lineId(line);
                this.latestId = Math.max(this.latestId, id);
                if (id > latestId && isReceived(line)) {
                    received = true;
                    unseen += view.id === shown ? 0 : 1;
                }
            }
        }
        if (unseen > 0) {
            this._unreadReceived.update((count: number) => count + unseen);
        }
        // A message of another participant rings unless read as it comes: unseen, or the page hidden
        if (received && (unseen > 0 || !this.pageVisibility.visible())) {
            this.soundService.play(SoundEffect.CHAT_MESSAGE);
        }

        const lines: ReadonlyArray<Readonly<PrivateLine>> | undefined = views.find((view: Readonly<PrivateConversationView>) => view.id === shown)?.lines;
        if (lines !== undefined) {
            this.show(shown as string, lines);
        }
    }

    /** The lines of the conversation shown are read: the log scrolls down to a new last one */
    private show(shown: string, lines: ReadonlyArray<Readonly<PrivateLine>>): void {
        const last: number = Math.max(0, ...lines.map((line: Readonly<PrivateLine>) => lineId(line)));
        if (this.seen().get(shown) !== last) {
            this.seen.update((seen: ReadonlyMap<string, number>) => new Map(seen).set(shown, last));
        }
        const shownLine: string = `${ shown }:${ last }`;
        this.scrollPending ||= shownLine !== this.shownLine;
        this.shownLine = shownLine;
    }
}
