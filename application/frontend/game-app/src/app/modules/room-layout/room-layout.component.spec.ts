import { Component, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSidenav } from '@angular/material/sidenav';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { RoomLayoutComponent } from './room-layout.component';
import { ChatMessengerType, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { DialogService } from '@app/services/dialog/dialog.service';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MatchLeaveWarning } from './match-leave-warning';

type FakeMediaQueryList = EventTarget & { matches: boolean };

describe('RoomLayoutComponent', () => {
    let fixture: ComponentFixture<RoomLayoutComponent>;
    let roomSetupService: RoomSetupService;
    let wideScreen: FakeMediaQueryList;
    let inMatch: WritableSignal<boolean>;
    let dialogService: DialogService;

    beforeEach(async () => {
        localStorage.clear();
        wideScreen = Object.assign(new EventTarget(), { matches: true });
        vi.spyOn(globalThis, 'matchMedia').mockImplementation((query: string) =>
            (query === RoomLayoutComponent.wideQuery ? wideScreen : { matches: false, media: query }) as unknown as MediaQueryList);

        inMatch = signal(false);
        dialogService = TestHelper.cast<DialogService>({ confirm: vi.fn() });

        await TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [
                RoomSetupService,
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                { provide: DialogService, useValue: dialogService },
                // Provided by the page
                { provide: RoomSocketApi, useValue: TestHelper.cast<RoomSocketApi>({ waiting: signal(false) }) },
                { provide: MatchLeaveWarning, useValue: TestHelper.cast<MatchLeaveWarning>({ inMatch }) },
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

    test('should step back from the entry of the history its chat pushed, come back to with the chat closed', () => {
        // Given: the page left, then come back to on the entry of its chat
        const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
        TestBed.inject(Router).navigated = true;
        history.replaceState({ roomChat: true }, '');

        // When
        TestBed.createComponent(RoomLayoutComponent);
        history.replaceState(null, '');

        // Then: back to the page under it
        expect(back).toHaveBeenCalledTimes(1);
    });

    test('should stay on the entry of the history its chat pushed, reloaded on it', () => {
        // Given: the page under it another document, which a step back would load again
        const back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
        history.replaceState({ roomChat: true }, '');

        // When
        TestBed.createComponent(RoomLayoutComponent);
        history.replaceState(null, '');

        // Then
        expect(back).not.toHaveBeenCalled();
    });

    describe('with a room', () => {
        let network: RoomNetworkMock;
        let preferences: ChatPreferencesService;

        function query<E extends Element = HTMLElement>(selector: string): E | null {
            return fixture.nativeElement.querySelector(selector);
        }

        function toggle(): HTMLButtonElement {
            return query('#room-chat-toggle') as HTMLButtonElement;
        }

        function sidenav(): MatSidenav {
            return fixture.debugElement.query(By.directive(MatSidenav)).componentInstance;
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
            expect(pushState).toHaveBeenCalledWith(expect.objectContaining({ roomChat: true }), '');

            // When: opened again, its history entry is kept
            fixture.componentInstance['toggleChat'](true);
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

        test('should leave the room at once out of a match', async () => {
            // Given: the chat closed, no animation of the sidenav left running (its inert state updated 50 ms later)
            preferences.panelOpen.set(false);
            await showRoom();
            const leave = vi.spyOn(roomSetupService, 'leave');
            const button: HTMLButtonElement = query('#room-leave') as HTMLButtonElement;

            // When
            button.click();
            await fixture.whenStable();

            // Then
            expect(button.textContent).toContain('Leave');
            expect(leave).toHaveBeenCalledOnce();
            expect(dialogService.confirm).not.toHaveBeenCalled();
        });

        test.each([true, false])('should ask to confirm leaving the match the player plays: %s', async (confirmed: boolean) => {
            // Given
            preferences.panelOpen.set(false);
            await showRoom();
            inMatch.set(true);
            vi.mocked(dialogService.confirm).mockResolvedValue(confirmed);
            const leave = vi.spyOn(roomSetupService, 'leave');

            // When
            (query('#room-leave') as HTMLButtonElement).click();
            await fixture.whenStable();

            // Then
            expect(dialogService.confirm).toHaveBeenCalledExactlyOnceWith('rooms.leave.title', 'rooms.leave.message', 'confirm-cancel');
            expect(leave).toHaveBeenCalledTimes(confirmed ? 1 : 0);
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
                { provide: MatchLeaveWarning, useValue: TestHelper.cast<MatchLeaveWarning>({ inMatch: signal(false) }) },
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
