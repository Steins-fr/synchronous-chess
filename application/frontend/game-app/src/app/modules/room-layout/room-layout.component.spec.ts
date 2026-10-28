import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatSidenav } from '@angular/material/sidenav';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RoomLayoutComponent, RoomPanel } from './room-layout.component';
import { ChatMessengerType, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugButtonComponent } from '@app/modules/debug/webrtc-debug-button/webrtc-debug-button.component';
import { WEBRTC_DEBUG } from '@app/modules/debug/webrtc-debug.token';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MatchLeaveWarning } from './match-leave-warning';
import { RoomHistoryComponent } from './room-history/room-history.component';

type FakeMediaQueryList = EventTarget & { matches: boolean };

/** A page giving its history to the layout, beside its game */
@Component({
    imports: [RoomLayoutComponent, RoomHistoryComponent],
    template: `
<app-room-layout [game]="game" [room]="room()" [sideChat]="sideChat()">
    <app-room-history roomHistory currentTitle="Hands" [current]="[]" />
</app-room-layout>`,
})
class HistoryHostComponent {
    public readonly room = signal<Room<ChatPayloads> | undefined>(undefined);
    public readonly sideChat = signal<boolean>(true);
    protected readonly game: RoomGame = RoomGame.SEVENTEEN_POKER;
}

describe('RoomLayoutComponent', () => {
    let fixture: ComponentFixture<RoomLayoutComponent>;
    let roomSetupService: RoomSetupService;
    let wideScreen: FakeMediaQueryList;
    let leaveWarning: MatchLeaveWarning;

    beforeEach(async () => {
        localStorage.clear();
        wideScreen = Object.assign(new EventTarget(), { matches: true });
        vi.spyOn(globalThis, 'matchMedia').mockImplementation((query: string) =>
            (query === RoomLayoutComponent.wideQuery ? wideScreen : { matches: false, media: query }) as unknown as MediaQueryList);

        leaveWarning = TestHelper.cast<MatchLeaveWarning>({ confirmLeave: vi.fn().mockResolvedValue(true) });

        await TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [
                RoomSetupService,
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                // Provided by the page
                { provide: RoomSocketApi, useValue: TestHelper.cast<RoomSocketApi>({ waiting: signal(false) }) },
                { provide: MatchLeaveWarning, useValue: leaveWarning },
            ],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        fixture = TestBed.createComponent(RoomLayoutComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        answerOpenRooms();
        await fixture.whenStable();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should cover the content until the room is setup', async () => {
        // Then
        expect(fixture.nativeElement.querySelector('app-room-setup')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).not.toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).toBeNull();
    });

    test('should show the presentation of a page until the room is setup, without covering its content', async () => {
        // Given
        @Component({
            imports: [RoomLayoutComponent],
            template: `
<app-room-layout [game]="game" [dimContent]="false">
    <p class="presentation" roomPresentation>Presentation</p>
    <p class="content">Content</p>
</app-room-layout>`,
        })
        class HostComponent {
            protected readonly game: RoomGame = RoomGame.CHESS;
        }
        const host: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
        answerOpenRooms();
        await host.whenStable();

        // Then the presentation comes after the setup, the open rooms on top of the page
        const presentation: HTMLElement | null = host.nativeElement.querySelector('.presentation');
        expect(presentation).not.toBeNull();
        expect(presentation?.compareDocumentPosition(host.nativeElement.querySelector('app-room-setup'))).toEqual(Node.DOCUMENT_POSITION_PRECEDING);
        expect(host.nativeElement.querySelector('#page-content .content')).not.toBeNull();
        expect(host.nativeElement.querySelector('#room-content-overlay')).toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await host.whenStable();

        // Then
        expect(host.nativeElement.querySelector('.presentation')).toBeNull();
        expect(host.nativeElement.querySelector('#page-content .content')).not.toBeNull();
    });

    test('should step back from the entry of the history its panel pushed, come back to with the panel closed', () => {
        // Given: the page left, then come back to on the entry of its panel
        const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
        TestBed.inject(Router).navigated = true;
        history.replaceState({ roomPanel: true }, '');

        // When
        TestBed.createComponent(RoomLayoutComponent);
        history.replaceState(null, '');

        // Then: back to the page under it
        expect(back).toHaveBeenCalledTimes(1);
    });

    test('should stay on the entry of the history its panel pushed, reloaded on it', () => {
        // Given: the page under it another document, which a step back would load again
        const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
        history.replaceState({ roomPanel: true }, '');

        // When
        TestBed.createComponent(RoomLayoutComponent);
        history.replaceState(null, '');

        // Then
        expect(back).not.toHaveBeenCalled();
    });

    describe('with a room', () => {
        let network: RoomNetworkMock;
        let preferences: ChatPreferencesService;
        // The fixture shown: the layout alone, or a page holding it
        let root: ComponentFixture<unknown>;

        function query<E extends Element = HTMLElement>(selector: string): E | null {
            return root.nativeElement.querySelector(selector);
        }

        function toggle(): HTMLButtonElement {
            return query('#room-chat-toggle') as HTMLButtonElement;
        }

        function sidenav(): MatSidenav {
            return root.debugElement.query(By.directive(MatSidenav)).componentInstance;
        }

        function receive(from: string, text: string): void {
            network.onMessage$.next({ type: ChatMessengerType.CHAT_MESSAGE, payload: { id: crypto.randomUUID(), text, at: Date.now() }, origin: MessageOriginType.ROOM_SERVICE, from });
        }

        async function showRoom(): Promise<void> {
            network = new RoomNetworkMock();
            fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
            roomSetupService.roomIsSetup(true);
            await fixture.whenStable();
        }

        beforeEach(() => {
            preferences = TestBed.inject(ChatPreferencesService);
            root = fixture;
        });

        test('should show the bar of the room and its chat beside the game, open on a wide screen', async () => {
            // When
            await showRoom();

            // Then
            expect(query('#room-bar')?.textContent).toContain('Room room');
            expect(toggle().textContent).toContain('Chat');
            expect(toggle().getAttribute('aria-expanded')).toEqual('true');
            expect(sidenav().mode).toEqual('side');
            expect(sidenav().opened).toEqual(true);
            expect(sidenav().disableClose).toEqual(true);
            expect(query('#room-chat app-chat')).not.toBeNull();
            expect(query('#chat-close')).not.toBeNull();
            // No history without one given by the page
            expect(query('#room-history-toggle')).toBeNull();
            expect(query('#room-history')).toBeNull();
            // Developer tooling, off unless the environment turns it on
            expect(query('app-debug-webrtc-button')).toBeNull();
        });

        test('should keep the chat closed on a wide screen once the user closed it', async () => {
            // Given
            await showRoom();

            // When
            toggle().click();
            await fixture.whenStable();

            // Then
            expect(preferences.panelOpen.on()).toEqual(false);
            expect(sidenav().opened).toEqual(false);
            expect(toggle().getAttribute('aria-expanded')).toEqual('false');

            // When: closed by its own button, once open again
            toggle().click();
            await fixture.whenStable();
            (query('#chat-close') as HTMLButtonElement).click();
            await fixture.whenStable();

            // Then
            expect(preferences.panelOpen.on()).toEqual(false);
        });

        test('should open the chat over the game on a narrow screen, closed by the back gesture', async () => {
            // Given
            wideScreen.matches = false;
            wideScreen.dispatchEvent(new Event('change'));
            const pushState = vi.spyOn(history, 'pushState');
            const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
            await showRoom();

            // Then
            expect(sidenav().mode).toEqual('over');
            expect(sidenav().opened).toEqual(false);
            expect(sidenav().disableClose).toEqual(false);

            // When
            toggle().click();
            await fixture.whenStable();

            // Then
            expect(sidenav().opened).toEqual(true);
            expect(pushState).toHaveBeenCalledWith(expect.objectContaining({ roomPanel: true }), '');

            // When: opened again, its history entry is kept
            fixture.componentInstance['togglePanel'](RoomPanel.CHAT, true);
            dispatchEvent(new PopStateEvent('popstate'));
            await fixture.whenStable();

            // Then
            expect(pushState).toHaveBeenCalledTimes(1);
            expect(sidenav().opened).toEqual(false);
            expect(back).not.toHaveBeenCalled();
            expect(preferences.panelOpen.on()).toEqual(true);

            // When: another page of the history, the chat closed
            dispatchEvent(new PopStateEvent('popstate'));
            await fixture.whenStable();

            // Then
            expect(sidenav().opened).toEqual(false);
        });

        test('should leave its history entry once the chat over the game is closed by its button or by itself', async () => {
            // Given
            wideScreen.matches = false;
            wideScreen.dispatchEvent(new Event('change'));
            const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
            await showRoom();
            toggle().click();
            await fixture.whenStable();

            // When
            (query('#chat-close') as HTMLButtonElement).click();
            await fixture.whenStable();

            // Then
            expect(back).toHaveBeenCalledTimes(1);
            expect(sidenav().opened).toEqual(false);

            // When: Escape, or a click beside it
            toggle().click();
            await fixture.whenStable();
            sidenav().openedChange.emit(false);
            await fixture.whenStable();

            // Then
            expect(back).toHaveBeenCalledTimes(2);
            expect(toggle().getAttribute('aria-expanded')).toEqual('false');

            // When: closed already
            sidenav().openedChange.emit(false);
            sidenav().openedChange.emit(true);

            // Then
            expect(back).toHaveBeenCalledTimes(2);
        });

        test('should close the chat over the game once the screen widens, or the room is given up', async () => {
            // Given
            wideScreen.matches = false;
            wideScreen.dispatchEvent(new Event('change'));
            const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
            preferences.panelOpen.set(false);
            await showRoom();
            toggle().click();
            await fixture.whenStable();

            // When: wide enough for the chat beside the game
            wideScreen.matches = true;
            wideScreen.dispatchEvent(new Event('change'));
            await fixture.whenStable();

            // Then: its entry of the history left, closed as the user left it beside the game
            expect(back).toHaveBeenCalledTimes(1);
            expect(sidenav().opened).toEqual(false);

            // When: narrow again
            wideScreen.matches = false;
            wideScreen.dispatchEvent(new Event('change'));
            await fixture.whenStable();

            // Then
            expect(sidenav().opened).toEqual(false);

            // When: the room given up, its URL replaced already
            toggle().click();
            await fixture.whenStable();
            fixture.componentRef.setInput('room', undefined);
            await fixture.whenStable();
            await showRoom();

            // Then: the chat of the next room closed
            expect(back).toHaveBeenCalledTimes(1);
            expect(sidenav().opened).toEqual(false);
        });

        test('should count the unread messages on the button of the chat, which pulses', async () => {
            // Given
            preferences.panelOpen.set(false);
            await showRoom();
            const animate = vi.fn();
            toggle().animate = animate;

            // When
            receive('remote', 'hello');
            await fixture.whenStable();

            // Then
            expect(query('.mat-badge-content')?.textContent).toEqual('1');
            expect(animate).toHaveBeenCalledWith(expect.any(Array), { duration: 0, easing: 'ease-out' });

            // When: the duration of the motions of the app
            document.documentElement.style.setProperty('--app-motion-fast', '300ms');
            receive('remote', 'world');
            await fixture.whenStable();

            // Then
            expect(query('.mat-badge-content')?.textContent).toEqual('2');
            expect(animate).toHaveBeenLastCalledWith(expect.any(Array), { duration: 300, easing: 'ease-out' });
            document.documentElement.style.removeProperty('--app-motion-fast');

            // When
            toggle().click();
            await fixture.whenStable();

            // Then
            expect(query('.mat-badge-hidden')).not.toBeNull();
            expect(animate).toHaveBeenCalledTimes(2);
        });

        test('should leave the room once its player confirms, the focus moved to the creation of a room', async () => {
            // Given: the chat closed, no animation of the sidenav left running (its inert state updated 50 ms later)
            preferences.panelOpen.set(false);
            await showRoom();
            // The room given up by the page, the list shown again
            const leave = vi.spyOn(roomSetupService, 'leave').mockImplementation(() => roomSetupService.roomIsSetup(false));
            const button: HTMLButtonElement = query('#room-leave') as HTMLButtonElement;
            button.focus();

            // When
            button.click();
            // The list asked again once shown
            await vi.waitFor(() => expect(leave).toHaveBeenCalledOnce());
            answerOpenRooms();
            await fixture.whenStable();

            // Then
            expect(button.textContent).toContain('Leave');
            expect(leaveWarning.confirmLeave).toHaveBeenCalledOnce();
            expect(query('#room-bar')).toBeNull();
            expect(document.activeElement).toBe(query('#room-create'));
        });

        test('should stay in the room once its player cancels leaving its match', async () => {
            // Given
            preferences.panelOpen.set(false);
            await showRoom();
            vi.mocked(leaveWarning.confirmLeave).mockResolvedValue(false);
            const leave = vi.spyOn(roomSetupService, 'leave');

            // When
            (query('#room-leave') as HTMLButtonElement).click();
            await fixture.whenStable();

            // Then
            expect(leave).not.toHaveBeenCalled();
            expect(query('#room-bar')).not.toBeNull();
        });

        test('should leave the chat to the page holding it itself', async () => {
            // Given
            fixture.componentRef.setInput('sideChat', false);

            // When
            await showRoom();

            // Then
            expect(query('#room-bar')).not.toBeNull();
            expect(query('#room-leave')).not.toBeNull();
            expect(toggle()).toBeNull();
            expect(query('mat-sidenav')).toBeNull();

            // When: no button to pulse
            fixture.componentInstance['pulse']();

            // Then: nothing unread without a chat
            expect(toggle()).toBeNull();
            expect(fixture.componentInstance['unread']()).toEqual(0);
        });

        describe('with a history', () => {
            let host: ComponentFixture<HistoryHostComponent>;

            function historyToggle(): HTMLButtonElement {
                return query('#room-history-toggle') as HTMLButtonElement;
            }

            function chatPanel(): HTMLElement {
                return query('#room-chat') as HTMLElement;
            }

            function historyPanel(): HTMLElement {
                return query('#room-history') as HTMLElement;
            }

            function layout(): RoomLayoutComponent {
                return host.debugElement.query(By.directive(RoomLayoutComponent)).componentInstance;
            }

            async function showHostRoom(): Promise<void> {
                network = new RoomNetworkMock();
                host.componentInstance.room.set(new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
                roomSetupService.roomIsSetup(true);
                await host.whenStable();
            }

            async function click(button: HTMLButtonElement): Promise<void> {
                button.click();
                await host.whenStable();
            }

            // Without its animation, the drawer closed tells it on the next turn of the event loop: past it, before it opens again
            async function settle(): Promise<void> {
                await new Promise<void>((resolve: () => void) => setTimeout(resolve));
                await host.whenStable();
            }

            beforeEach(async () => {
                host = TestBed.createComponent(HistoryHostComponent);
                root = host;
                answerOpenRooms();
                await host.whenStable();
            });

            test('should keep the history beside the game while another tab opens or closes its chat', async () => {
                // Given
                await showHostRoom();
                await click(historyToggle());

                // When: another tab closes its chat, then opens it
                for (const value of ['off', 'on']) {
                    localStorage.setItem(ChatPreferencesService.panelKey, value);
                    dispatchEvent(new StorageEvent('storage', { key: ChatPreferencesService.panelKey, storageArea: localStorage }));
                    await host.whenStable();

                    // Then
                    expect(historyPanel().hidden).toEqual(false);
                    expect(sidenav().opened).toEqual(true);
                }

                // When: the history closed, another tab closing its chat
                await click(historyToggle());
                localStorage.setItem(ChatPreferencesService.panelKey, 'off');
                dispatchEvent(new StorageEvent('storage', { key: ChatPreferencesService.panelKey, storageArea: localStorage }));
                await host.whenStable();

                // Then: the chat follows it
                expect(sidenav().opened).toEqual(false);
            });

            test('should open the history beside the game on a wide screen in place of the chat, never remembered', async () => {
                // When
                await showHostRoom();

                // Then: the chat as the user left it, the history of the page closed
                expect(historyToggle().textContent).toContain('History');
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');
                expect(historyToggle().getAttribute('aria-controls')).toEqual('room-history');
                expect(sidenav().opened).toEqual(true);
                expect(chatPanel().hidden).toEqual(false);
                expect(historyPanel().hidden).toEqual(true);
                expect(historyPanel().querySelector('h2')?.textContent).toEqual('History');
                expect(historyPanel().querySelector('app-room-history #history-current h3')?.textContent).toEqual('Hands');

                // When
                await click(historyToggle());

                // Then: in the same panel
                expect(sidenav().opened).toEqual(true);
                expect(historyPanel().hidden).toEqual(false);
                expect(chatPanel().hidden).toEqual(true);
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('true');
                expect(toggle().getAttribute('aria-expanded')).toEqual('false');
                expect(preferences.panelOpen.on()).toEqual(true);

                // When: the chat again
                await click(toggle());

                // Then
                expect(sidenav().opened).toEqual(true);
                expect(chatPanel().hidden).toEqual(false);
                expect(historyPanel().hidden).toEqual(true);
                expect(toggle().getAttribute('aria-expanded')).toEqual('true');
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');

                // When: the history closed by the button of the bar
                await click(historyToggle());
                await click(historyToggle());

                // Then: the panel closed, the chat still open for the user, the history sliding away with the drawer
                expect(sidenav().opened).toEqual(false);
                expect(preferences.panelOpen.on()).toEqual(true);
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');
                expect(toggle().getAttribute('aria-expanded')).toEqual('false');
                expect(historyPanel().hidden).toEqual(false);
                expect(chatPanel().hidden).toEqual(true);
            });

            test('should close the history by its own button', async () => {
                // Given
                await showHostRoom();
                await click(historyToggle());
                const close: HTMLButtonElement = query('#history-close') as HTMLButtonElement;

                // When
                await click(close);

                // Then
                expect(close.getAttribute('aria-label')).toEqual('Close the history');
                expect(sidenav().opened).toEqual(false);
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');
                expect(preferences.panelOpen.on()).toEqual(true);
            });

            test('should keep the chat shown while the drawer closes beside the game', async () => {
                // Given
                await showHostRoom();

                // When
                await click(toggle());

                // Then: its content slides away with it
                expect(sidenav().opened).toEqual(false);
                expect(chatPanel().hidden).toEqual(false);
                expect(historyPanel().hidden).toEqual(true);
            });

            test('should count the unread messages on the button of the chat while the history shows', async () => {
                // Given
                await showHostRoom();
                await click(historyToggle());
                toggle().animate = vi.fn();

                // When
                receive('remote', 'hello');
                await host.whenStable();

                // Then
                expect(query('.mat-badge-content')?.textContent).toEqual('1');
                expect(historyToggle().querySelector('.mat-badge-content')).toBeNull();

                // When
                await click(toggle());

                // Then
                expect(query('.mat-badge-hidden')).not.toBeNull();
            });

            test('should start the next room with its history closed, the chat as the user left it', async () => {
                // Given
                await showHostRoom();
                await click(historyToggle());

                // When: the room given up, then another one
                host.componentInstance.room.set(undefined);
                await host.whenStable();
                await showHostRoom();

                // Then
                expect(sidenav().opened).toEqual(true);
                expect(chatPanel().hidden).toEqual(false);
                expect(historyPanel().hidden).toEqual(true);
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');
                expect(toggle().getAttribute('aria-expanded')).toEqual('true');
            });

            test('should offer the history alone to a page holding its chat itself', async () => {
                // Given: the chat left open beside the game on another page
                host.componentInstance.sideChat.set(false);

                // When
                await showHostRoom();

                // Then: no chat beside the game, the panel closed rather than empty
                expect(preferences.panelOpen.on()).toEqual(true);
                expect(toggle()).toBeNull();
                expect(chatPanel()).toBeNull();
                expect(sidenav().opened).toEqual(false);

                // When
                await click(historyToggle());

                // Then
                expect(sidenav().opened).toEqual(true);
                expect(historyPanel().hidden).toEqual(false);
            });

            test('should open the history over the game on a narrow screen, on a single entry of the browser history', async () => {
                // Given
                wideScreen.matches = false;
                wideScreen.dispatchEvent(new Event('change'));
                const pushState = vi.spyOn(history, 'pushState');
                const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
                await showHostRoom();
                expect(sidenav().opened).toEqual(false);

                // When
                await click(historyToggle());

                // Then
                expect(sidenav().opened).toEqual(true);
                expect(historyPanel().hidden).toEqual(false);
                expect(pushState).toHaveBeenCalledOnce();
                expect(pushState).toHaveBeenCalledWith(expect.objectContaining({ roomPanel: true }), '');

                // When: the chat in its place, in the code only: the backdrop covers the bar
                layout()['togglePanel'](RoomPanel.CHAT, true);
                await host.whenStable();

                // Then: on the same entry
                expect(sidenav().opened).toEqual(true);
                expect(chatPanel().hidden).toEqual(false);
                expect(historyPanel().hidden).toEqual(true);
                expect(pushState).toHaveBeenCalledOnce();

                // When: the history again, closed by its button
                layout()['togglePanel'](RoomPanel.HISTORY, true);
                await host.whenStable();
                await click(query('#history-close') as HTMLButtonElement);
                await settle();

                // Then: its entry left, the chat of the user untouched
                expect(back).toHaveBeenCalledOnce();
                expect(sidenav().opened).toEqual(false);
                expect(preferences.panelOpen.on()).toEqual(true);

                // When: opened again, then the back gesture
                await click(historyToggle());
                dispatchEvent(new PopStateEvent('popstate'));
                await settle();

                // Then
                expect(pushState).toHaveBeenCalledTimes(2);
                expect(sidenav().opened).toEqual(false);
                expect(back).toHaveBeenCalledOnce();

                // When: opened again, closed by itself: Escape, or a click beside it
                await click(historyToggle());
                sidenav().openedChange.emit(false);
                await host.whenStable();

                // Then
                expect(back).toHaveBeenCalledTimes(2);
                expect(sidenav().opened).toEqual(false);
                expect(historyToggle().getAttribute('aria-expanded')).toEqual('false');
            });
        });
    });
});

describe('RoomLayoutComponent recompiled from its metadata', () => {
    test('should resolve the query of the button of its chat', async () => {
        // Given
        TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [
                RoomSetupService,
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                { provide: RoomSocketApi, useValue: TestHelper.cast<RoomSocketApi>({ waiting: signal(false) }) },
                { provide: MatchLeaveWarning, useValue: TestHelper.cast<MatchLeaveWarning>({}) },
            ],
        });
        TestBed.overrideComponent(RoomLayoutComponent, { add: { host: { class: 'recompiled' } } });
        const fixture: ComponentFixture<RoomLayoutComponent> = TestBed.createComponent(RoomLayoutComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), new RoomNetworkMock().roomNetwork));
        TestBed.inject(RoomSetupService).roomIsSetup(true);
        answerOpenRooms();

        // When
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('recompiled');
        expect(fixture.componentInstance['chatButton']()?.nativeElement.id).toEqual('room-chat-toggle');
    });
});

describe('RoomLayoutComponent with the debug panel of WebRTC', () => {
    let fixture: ComponentFixture<RoomLayoutComponent>;

    function button(): HTMLElement | null {
        return fixture.nativeElement.querySelector('app-debug-webrtc-button');
    }

    beforeEach(async () => {
        TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [
                RoomSetupService,
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                { provide: RoomSocketApi, useValue: TestHelper.cast<RoomSocketApi>({ waiting: signal(false) }) },
                { provide: MatchLeaveWarning, useValue: TestHelper.cast<MatchLeaveWarning>({}) },
                { provide: WEBRTC_DEBUG, useValue: true },
                // A real bottom sheet: see webrtc-debug-button.component.spec.ts
                { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
                {
                    provide: BreakpointObserver, useValue: TestHelper.cast<BreakpointObserver>({
                        observe: () => of<BreakpointState>({ matches: false, breakpoints: {} }),
                        isMatched: (): boolean => false,
                    }),
                },
            ],
        });
        fixture = TestBed.createComponent(RoomLayoutComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        answerOpenRooms();
        await fixture.whenStable();
    });

    test('should offer the debug panel at the end of the page once the room is set up, until the room is given up', async () => {
        // Then: none on the open rooms
        expect(button()).toBeNull();

        // When: the room built, not set up yet
        const room: Room<ChatPayloads> = new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), new RoomNetworkMock().roomNetwork);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();

        // Then
        expect(button()).toBeNull();

        // When
        TestBed.inject(RoomSetupService).roomIsSetup(true);
        await fixture.whenStable();

        // Then: the button of the room, in the content after the page, under the chat
        const debugButton: WebrtcDebugButtonComponent<ChatPayloads> = fixture.debugElement.query(By.directive(WebrtcDebugButtonComponent)).componentInstance;
        expect(debugButton.room()).toBe(room);
        expect(button()?.querySelector('#webrtc-debug-open')).not.toBeNull();
        expect(button()?.closest('mat-sidenav-content')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content').compareDocumentPosition(button())).toEqual(Node.DOCUMENT_POSITION_FOLLOWING);

        // When: the room given up
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        expect(button()).toBeNull();
    });

    test('should close the debug panel open with the room given up', async () => {
        // Given
        fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), new RoomNetworkMock().roomNetwork));
        TestBed.inject(RoomSetupService).roomIsSetup(true);
        await fixture.whenStable();
        button()?.querySelector<HTMLButtonElement>('#webrtc-debug-open')?.click();
        await fixture.whenStable();
        expect(document.querySelector('mat-bottom-sheet-container')).not.toBeNull();

        // When: the button removed by the change detection
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        await vi.waitFor(() => expect(document.querySelector('mat-bottom-sheet-container')).toBeNull());
    });
});
