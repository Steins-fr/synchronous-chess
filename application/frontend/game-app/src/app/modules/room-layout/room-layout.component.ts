
import {
    afterNextRender,
    Component,
    computed,
    contentChild,
    DestroyRef,
    DOCUMENT,
    effect,
    ElementRef,
    inject,
    Injector,
    input,
    linkedSignal,
    Signal,
    signal,
    untracked,
    viewChild
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatBadge } from '@angular/material/badge';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugButtonComponent } from '@app/modules/debug/webrtc-debug-button/webrtc-debug-button.component';
import { WEBRTC_DEBUG } from '@app/modules/debug/webrtc-debug.token';
import { PrivateConversations } from '@app/modules/private-conversations/classes/private-conversations';
import { PrivateConversationsComponent } from '@app/modules/private-conversations/components/private-conversations/private-conversations.component';
import { RoomSetupComponent } from '@app/modules/room-setup/room-setup.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { fromEvent } from 'rxjs';
import { MatchLeaveWarning } from './match-leave-warning';
import { RoomHistoryComponent } from './room-history/room-history.component';

/** The entry of the browser history of the panel opened over the game: the back gesture closes it */
const PANEL_HISTORY_STATE: string = 'roomPanel';

/** The contents of the panel of the room, beside the game or over it */
export enum RoomPanel {
    CHAT = 'chat',
    HISTORY = 'history',
    PRIVATE = 'private',
}

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    imports: [
        RoomSetupComponent, ChatComponent, PrivateConversationsComponent, WebrtcDebugButtonComponent, MatSidenavContainer, MatSidenavContent, MatSidenav, MatButton, MatIconButton,
        MatIcon, MatBadge, TranslocoPipe,
    ],
    host: {
        class: 'block h-full',
    },
})
export class RoomLayoutComponent {
    /** Wide enough for the panel beside the game: narrower, it opens over the game */
    public static readonly wideQuery: string = '(min-width: 1024px)';

    /** The game of the page: its rooms are listed, created and joined */
    public readonly game = input.required<RoomGame>();
    /** Whether the content is dimmed until the room is set up, as a preview of the page */
    public readonly dimContent = input<boolean>(true);
    /** The room of the page, once built */
    public readonly room = input<Room<ChatPayloads>>();
    /** The chat of the room opens beside the game, from the bar of the room: the page of the chat shows it itself */
    public readonly sideChat = input<boolean>(true);
    /**
     * The private conversations of the room, the same instance for its life: the panel keeps what it read of it, and
     * offers them to their members
     */
    public readonly conversations = input<PrivateConversations>();

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly preferences = inject(ChatPreferencesService);
    private readonly leaveWarning = inject(MatchLeaveWarning);
    private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
    private readonly injector = inject(Injector);
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;
    private readonly wideScreen: MediaQueryList = this.window.matchMedia(RoomLayoutComponent.wideQuery);

    /** Whether the page offers the debug panel of WebRTC (webrtcDebug of the environment): developer tooling */
    protected readonly webrtcDebug: boolean = inject(WEBRTC_DEBUG);
    protected readonly isSetup = toSignal(this.roomSetupService.roomIsSetup$);
    protected readonly wide = signal<boolean>(this.wideScreen.matches);
    protected readonly panels = RoomPanel;
    /** The history the page gives, beside its game: the panel offers it */
    protected readonly history = contentChild(RoomHistoryComponent);
    // Beside the game, the chat as the user left it, which another tab may change, the history and the private
    // conversations closed until opened: never remembered, nor closed by another tab
    private readonly besidePanel = linkedSignal<boolean, RoomPanel | null>({
        source: (): boolean => this.chatBeside(),
        computation: (on: boolean, previous?: { value: RoomPanel | null }): RoomPanel | null => {
            if (previous?.value === RoomPanel.HISTORY || previous?.value === RoomPanel.PRIVATE) {
                return previous.value;
            }
            return on ? RoomPanel.CHAT : null;
        },
    });
    // Over the game, the panel is closed when the page shows
    private readonly overPanel = signal<RoomPanel | null>(null);
    /** The content of the panel open, none while it is closed */
    protected readonly panel = computed<RoomPanel | null>(() => this.wide() ? this.besidePanel() : this.overPanel());
    /** The content of the panel kept while it closes: it slides away with its content */
    protected readonly shownPanel = linkedSignal<RoomPanel | null, RoomPanel | null>({
        source: this.panel,
        computation: (panel: RoomPanel | null, previous?: { value: RoomPanel | null }): RoomPanel | null => panel ?? previous?.value ?? null,
    });
    protected readonly chatOpen = computed<boolean>(() => this.panel() === RoomPanel.CHAT);
    protected readonly historyOpen = computed<boolean>(() => this.panel() === RoomPanel.HISTORY);
    protected readonly privateOpen = computed<boolean>(() => this.panel() === RoomPanel.PRIVATE);
    /** The local player is a member of a private conversation: a spectator has none */
    protected readonly hasPrivate = computed<boolean>(() => (this.conversations()?.mine().length ?? 0) > 0);

    private readonly chat = viewChild(ChatComponent);
    private readonly chatButton = viewChild<string, ElementRef<HTMLElement>>('chatButton', { read: ElementRef });
    protected readonly unread = computed<number>(() => this.chat()?.unread() ?? 0);
    private readonly privateTalk = viewChild(PrivateConversationsComponent);
    private readonly privateButton = viewChild<string, ElementRef<HTMLElement>>('privateButton', { read: ElementRef });
    protected readonly privateUnread = computed<number>(() => this.privateTalk()?.unread() ?? 0);
    // The panel opened over the game pushed an entry to the browser history, which the back gesture removes
    private panelInHistory: boolean = false;

    public constructor() {
        const destroyRef: DestroyRef = inject(DestroyRef);
        // Come back to the entry the panel pushed, the panel closed: back to the page under it, at the same URL, which the
        // router does not navigate to. Not once reloaded on it: the page under it is another document, it would load again
        if (inject(Router).navigated && (this.window.history.state as Record<string, unknown> | null)?.[PANEL_HISTORY_STATE] === true) {
            this.window.history.back();
        }
        fromEvent(this.wideScreen, 'change').pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.wide.set(this.wideScreen.matches));
        fromEvent(this.window, 'popstate').pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
            if (this.panelInHistory) {
                this.panelInHistory = false;
                this.overPanel.set(null);
            }
        });

        // The panel over the game gone: the room given up, its URL replaced already, or the screen wide enough for the panel
        // beside the game, its entry of the history left
        effect(() => {
            const overGame: boolean = this.room() !== undefined && !this.wide();
            untracked(() => {
                if (!overGame) {
                    if (this.panelInHistory && this.wide()) {
                        this.window.history.back();
                    }
                    this.panelInHistory = false;
                    this.overPanel.set(null);
                }
            });
        });

        // The room given up: the history of the next one closed until opened, its chat as the user left it
        effect(() => {
            if (this.room() === undefined) {
                untracked(() => this.besidePanel.set(this.chatBeside() ? RoomPanel.CHAT : null));
            }
        });

        // No private conversation left for the local player, a spectator of the next game: their panel closes with its button
        effect(() => {
            if (!this.hasPrivate() && untracked(() => this.panel()) === RoomPanel.PRIVATE) {
                untracked(() => this.togglePanel(RoomPanel.PRIVATE, false));
            }
        });

        // A new message unread: the button of the chat pulses, not for the unread messages of a player shown again
        this.pulseOnReceived(() => this.chat()?.unreadReceived() ?? 0, this.chatButton);
        this.pulseOnReceived(() => this.privateTalk()?.unreadReceived() ?? 0, this.privateButton);
    }

    /** Shows a content of the panel, which another one shown gives way to, or closes it */
    protected togglePanel(panel: RoomPanel, open: boolean): void {
        if (this.wide()) {
            // Only the chat is remembered
            if (panel === RoomPanel.CHAT) {
                this.preferences.panelOpen.set(open);
            }
            this.besidePanel.set(open ? panel : null);
            return;
        }

        this.overPanel.set(open ? panel : null);
        if (open && !this.panelInHistory) {
            // The state of the router kept: the same page, which the router does not navigate to again
            this.window.history.pushState({ ...this.window.history.state, [PANEL_HISTORY_STATE]: true }, '');
            this.panelInHistory = true;
        } else if (!open && this.panelInHistory) {
            this.panelInHistory = false;
            this.window.history.back();
        }
    }

    /** The player leaves the room, staying on the page: the open rooms show again */
    protected async leaveRoom(): Promise<void> {
        if (await this.leaveWarning.confirmLeave()) {
            this.roomSetupService.leave();
            // The bar gone with the button focused: the focus moves to the creation of a room, rather than to the page
            afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>('#room-create')?.focus(), { injector: this.injector });
        }
    }

    /** The sidenav closed by itself: Escape, or a click beside it */
    protected onPanelOpenedChange(opened: boolean): void {
        const panel: RoomPanel | null = this.panel();
        if (!opened && panel !== null) {
            this.togglePanel(panel, false);
        }
    }

    /** The chat beside the game as the user left it, on a page showing it there */
    private chatBeside(): boolean {
        return this.sideChat() && this.preferences.panelOpen.on();
    }

    /** The button pulses at each new message unread its panel counts */
    private pulseOnReceived(received: () => number, button: Signal<ElementRef<HTMLElement> | undefined>): void {
        let counted: number = 0;
        effect(() => {
            const count: number = received();
            if (count > counted) {
                this.pulse(untracked(button)?.nativeElement);
            }
            counted = count;
        });
    }

    private pulse(button: HTMLElement | undefined): void {
        // The duration of the motions of the app: none when the user reduces them
        const duration: number = Number.parseFloat(this.window.getComputedStyle(this.window.document.documentElement).getPropertyValue('--app-motion-fast')) || 0;
        button?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration, easing: 'ease-out' });
    }
}
