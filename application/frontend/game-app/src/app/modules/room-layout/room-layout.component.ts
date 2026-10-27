
import { Component, computed, DestroyRef, DOCUMENT, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatBadge } from '@angular/material/badge';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatSidenav, MatSidenavContainer, MatSidenavContent } from '@angular/material/sidenav';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { RoomSetupComponent } from '@app/modules/room-setup/room-setup.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { fromEvent } from 'rxjs';

/** The history entry of the chat opened over the game: the back gesture closes it */
const CHAT_HISTORY_STATE: string = 'roomChat';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    imports: [RoomSetupComponent, ChatComponent, MatSidenavContainer, MatSidenavContent, MatSidenav, MatButton, MatIcon, MatBadge, TranslocoPipe],
    host: {
        class: 'block h-full',
    },
})
export class RoomLayoutComponent {
    /** Wide enough for the chat beside the game: narrower, it opens over the game */
    public static readonly wideQuery: string = '(min-width: 1024px)';

    /** The game of the page: its rooms are listed, created and joined */
    public readonly game = input.required<RoomGame>();
    /** Whether the content is dimmed until the room is set up, as a preview of the page */
    public readonly dimContent = input<boolean>(true);
    /** The room of the page, once built */
    public readonly room = input<Room<ChatPayloads>>();
    /** The chat of the room opens beside the game, from the bar of the room: the page of the chat shows it itself */
    public readonly sideChat = input<boolean>(true);

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly preferences = inject(ChatPreferencesService);
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;
    private readonly wideScreen: MediaQueryList = this.window.matchMedia(RoomLayoutComponent.wideQuery);

    protected readonly isSetup = toSignal(this.roomSetupService.roomIsSetup$);
    protected readonly wide = signal<boolean>(this.wideScreen.matches);
    // Over the game, the chat is closed when the page shows: a wide screen opens it as the user left it
    private readonly overChatOpen = signal<boolean>(false);
    protected readonly chatOpen = computed<boolean>(() => this.wide() ? this.preferences.panelOpen.on() : this.overChatOpen());

    private readonly chat = viewChild(ChatComponent);
    private readonly chatButton = viewChild<string, ElementRef<HTMLElement>>('chatButton', { read: ElementRef });
    protected readonly unread = computed<number>(() => this.chat()?.unread() ?? 0);
    // The chat opened over the game pushed an entry to the history, which the back gesture removes
    private chatInHistory: boolean = false;

    public constructor() {
        const destroyRef: DestroyRef = inject(DestroyRef);
        // Come back to the entry the chat pushed, the chat closed: back to the page under it, at the same URL, which the
        // router does not navigate to. Not once reloaded on it: the page under it is another document, it would load again
        if (inject(Router).navigated && (this.window.history.state as Record<string, unknown> | null)?.[CHAT_HISTORY_STATE] === true) {
            this.window.history.back();
        }
        fromEvent(this.wideScreen, 'change').pipe(takeUntilDestroyed(destroyRef)).subscribe(() => this.wide.set(this.wideScreen.matches));
        fromEvent(this.window, 'popstate').pipe(takeUntilDestroyed(destroyRef)).subscribe(() => {
            if (this.chatInHistory) {
                this.chatInHistory = false;
                this.overChatOpen.set(false);
            }
        });

        // The chat over the game gone: the room given up, its URL replaced already, or the screen wide enough for the chat
        // beside the game, its entry of the history left
        effect(() => {
            const overGame: boolean = this.sideChat() && this.room() !== undefined && !this.wide();
            untracked(() => {
                if (!overGame) {
                    if (this.chatInHistory && this.wide()) {
                        this.window.history.back();
                    }
                    this.chatInHistory = false;
                    this.overChatOpen.set(false);
                }
            });
        });

        // A new message unread: the button of the chat pulses, not for the unread messages of a player shown again
        let received: number = 0;
        effect(() => {
            const count: number = this.chat()?.unreadReceived() ?? 0;
            if (count > received) {
                this.pulse();
            }
            received = count;
        });
    }

    protected toggleChat(open: boolean): void {
        if (this.wide()) {
            this.preferences.panelOpen.set(open);
            return;
        }

        this.overChatOpen.set(open);
        if (open && !this.chatInHistory) {
            // The state of the router kept: the same page, which the router does not navigate to again
            this.window.history.pushState({ ...this.window.history.state, [CHAT_HISTORY_STATE]: true }, '');
            this.chatInHistory = true;
        } else if (!open && this.chatInHistory) {
            this.chatInHistory = false;
            this.window.history.back();
        }
    }

    /** The sidenav closed by itself: Escape, or a click beside it */
    protected onChatOpenedChange(opened: boolean): void {
        if (!opened && this.chatOpen()) {
            this.toggleChat(false);
        }
    }

    private pulse(): void {
        const button: HTMLElement | undefined = this.chatButton()?.nativeElement;
        // The duration of the motions of the app: none when the user reduces them
        const duration: number = Number.parseFloat(this.window.getComputedStyle(this.window.document.documentElement).getPropertyValue('--app-motion-fast')) || 0;
        button?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration, easing: 'ease-out' });
    }
}
