import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatComponent, ChatEntry, ChatMessengerType, ChatPayloads, ChatText, isChatText } from './chat.component';
import { ChatEntryKind, ChatMessageState } from './chat-message/chat-message.component';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { Player } from '@app/services/room-manager/classes/player/player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { textAreaFieldInput } from '@testing/text-field.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';

describe('ChatComponent', () => {
    let fixture: ComponentFixture<ChatComponent>;
    let component: ChatComponent;
    let network: RoomNetworkMock;
    let room: Room<ChatPayloads>;
    let preferences: ChatPreferencesService;
    let webRtcPlayers: WebRtcPlayer[];

    /** A message of the chat from a player, sent when it is received unless told */
    function receive(from: string, text: string, at: number = Date.now(), id: string = crypto.randomUUID()): void {
        deliver(from, { id, text, at });
    }

    function deliver(from: string, payload: ChatText): void {
        network.onMessage$.next({ type: ChatMessengerType.CHAT_MESSAGE, payload, origin: MessageOriginType.ROOM_SERVICE, from });
    }

    /** The local player's message the room sends back: the one transmitted at this call */
    function echo(transmitSpy: MockInstance<Room<ChatPayloads>['transmitMessage']>, call: number = 0): void {
        deliver('local', transmitSpy.mock.calls[call][1] as ChatText);
    }

    /** A player connected to the local one: the local player opened the connection to a player joining after it */
    function webRtcPlayer(name: string, initiated: boolean): WebRtcPlayer {
        const player = new WebRtcPlayer(name, new WebrtcMock().webrtc, initiated);
        webRtcPlayers.push(player);
        return player;
    }

    function query<E extends Element = HTMLElement>(selector: string): E | null {
        return fixture.nativeElement.querySelector(selector);
    }

    function log(): HTMLElement {
        return query('#chat-log') as HTMLElement;
    }

    /** The texts of the log: the messages, with their author, and the notices */
    function logLines(): string[] {
        return [...log().querySelectorAll('.chat-bubble, .chat-notice, p.muted-note')].map((line: Element) => line.textContent.trim());
    }

    function sendButton(): HTMLButtonElement {
        return query('#send') as HTMLButtonElement;
    }

    function textArea(): HTMLTextAreaElement {
        return textAreaFieldInput(fixture.nativeElement, 'Type your message');
    }

    async function type(text: string): Promise<void> {
        textArea().value = text;
        textArea().dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    function press(init: KeyboardEventInit): KeyboardEvent {
        const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
        textArea().dispatchEvent(event);
        return event;
    }

    /** The log scrolled up, away from its bottom, or back to it */
    function scrollLog(fromBottom: number): void {
        Object.defineProperty(log(), 'scrollHeight', { configurable: true, value: 1000 });
        Object.defineProperty(log(), 'clientHeight', { configurable: true, value: 200 });
        log().scrollTop = 800 - fromBottom;
        log().dispatchEvent(new Event('scroll'));
    }

    async function openOptions(): Promise<HTMLButtonElement[]> {
        (query('#chat-options') as HTMLButtonElement).click();
        await fixture.whenStable();
        return [...document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-panel [role="menuitemcheckbox"]')];
    }

    async function setRoom(): Promise<void> {
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
    }

    beforeEach(async () => {
        localStorage.clear();
        webRtcPlayers = [];
        await TestBed.configureTestingModule({
            imports: [ChatComponent],
        }).compileComponents();

        network = new RoomNetworkMock();
        room = new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        preferences = TestBed.inject(ChatPreferencesService);
        fixture = TestBed.createComponent(ChatComponent);
        component = fixture.componentInstance;
    });

    afterEach(() => {
        vi.useRealTimers();
        webRtcPlayers.forEach((player: WebRtcPlayer) => player.clear());
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        localStorage.clear();
    });

    test('should show an empty chat, sending nothing until a message is typed', async () => {
        // When
        await setRoom();

        // Then
        expect(query('h2')?.textContent).toEqual('Chat');
        expect(query('#chat-close')).toBeNull();
        expect(query('#player-list')?.textContent).toContain('1 participant in the room');
        expect(logLines()).toEqual(['No messages yet. Say hello!']);
        expect(sendButton().disabled).toEqual(true);

        // When
        await type('hello');

        // Then
        expect(sendButton().disabled).toEqual(false);
    });

    test('should show its participants and the players joining', async () => {
        // Given
        await setRoom();

        // When
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        network.queueAdded$.next('pending');
        await fixture.whenStable();

        // Then
        expect(query('#player-list')?.textContent).toContain('2 participants in the room');
        expect(fixture.nativeElement.querySelectorAll('app-chat-participant')).toHaveLength(2);
        const chips: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('mat-chip');
        expect(chips[chips.length - 1].textContent).toContain('pending');
    });

    test('should be closed by its button once closable', async () => {
        // Given
        const closed = vi.fn();
        component.closed.subscribe(closed);
        fixture.componentRef.setInput('closable', true);
        await setRoom();

        // When
        (query('#chat-close') as HTMLButtonElement).click();

        // Then
        expect(closed).toHaveBeenCalledTimes(1);
    });

    test('should group the messages of an author, its name and the time above the first one', async () => {
        // Given
        vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 26, 10, 42).getTime());
        await setRoom();

        // When
        receive('remote', 'hello');
        receive('remote', 'how are you?');
        receive('other', 'hi');
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hello', 'remote: how are you?', 'other: hi']);
        const messages: NodeListOf<HTMLElement> = log().querySelectorAll('app-chat-message');
        expect(messages[0].querySelector('.text-app-chat-author')?.textContent).toEqual('remote');
        expect(messages[0].querySelector('time')?.textContent).toMatch(/^10:42\sAM$/);
        expect(messages[1].querySelector('.text-app-chat-author')).toBeNull();
        expect(messages[2].querySelector('.text-app-chat-author')?.textContent).toEqual('other');

        // When: the times hidden
        preferences.times.set(false);
        await fixture.whenStable();

        // Then
        expect(log().querySelector('time')).toBeNull();
    });

    test('should start another group after a pause', async () => {
        // Given
        const now = vi.spyOn(Date, 'now').mockReturnValue(0);
        await setRoom();
        receive('remote', 'hello');

        // When
        now.mockReturnValue(5 * 60 * 1000 + 1);
        receive('remote', 'still there?');
        await fixture.whenStable();

        // Then
        expect(log().querySelectorAll('.text-app-chat-author')).toHaveLength(2);
    });

    test('should tell the players arriving and leaving, unless hidden', async () => {
        // Given: the players of the room were there already, connecting to the local player once it joined
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        await setRoom();
        const host: WebRtcPlayer = webRtcPlayer('host', false);
        network.playerAdded$.next(host);
        await fixture.whenStable();
        expect(logLines()).toEqual(['No messages yet. Say hello!']);

        // When: a player joins, the local player connecting to it, and another one leaves then comes back
        network.playerAdded$.next(webRtcPlayer('other', true));
        await fixture.whenStable();
        network.playerRemoved$.next(host);
        await fixture.whenStable();
        network.playerAdded$.next(webRtcPlayer('host', false));
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['other joined the room', 'host left the room', 'host joined the room']);

        // When
        preferences.arrivals.set(false);
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['No messages yet. Say hello!']);
    });

    test('should tell a player left once the room agrees, not for a link lost then restored', async () => {
        // Given: a room with block chain, telling its departures once every participant lost the player
        const departed$ = new Subject<string>();
        vi.spyOn(room, 'departed$', 'get').mockReturnValue(departed$);
        await setRoom();
        const remote: WebRtcPlayer = webRtcPlayer('remote', true);
        network.playerAdded$.next(remote);
        await fixture.whenStable();

        // When: its link lost, then restored by the local player
        network.playerRemoved$.next(remote);
        await fixture.whenStable();
        network.playerAdded$.next(webRtcPlayer('remote', true));
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote joined the room']);

        // When: it left, then joins again
        departed$.next('remote');
        await fixture.whenStable();
        network.playerRemoved$.next(remote);
        await fixture.whenStable();
        network.playerAdded$.next(webRtcPlayer('remote', true));
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote joined the room', 'remote left the room', 'remote joined the room']);
    });

    test('should show again the messages of a player hidden once it left', async () => {
        // Given
        const departed$ = new Subject<string>();
        vi.spyOn(room, 'departed$', 'get').mockReturnValue(departed$);
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        await setRoom();
        receive('remote', 'hello');
        await fixture.whenStable();
        (await openOptions())[3].click();
        await fixture.whenStable();
        expect(logLines()).toEqual(['No messages yet. Say hello!']);

        // When
        departed$.next('remote');
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hello', 'remote left the room']);
        expect(query('app-chat-participant mat-icon')).toBeNull();
    });

    test('should send a message at once, waiting until the room sends it back', async () => {
        // Given
        vi.spyOn(Date, 'now').mockReturnValue(1000);
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('  hello\nworld ');

        // When
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(transmitSpy).toHaveBeenCalledWith(ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: 'hello\nworld', at: 1000 });
        expect(textArea().value).toEqual('');
        expect(textArea().disabled).toEqual(false);
        expect(sendButton().disabled).toEqual(true);
        expect(logLines()).toEqual(['local: hello\nworld']);
        expect(log().querySelector('.opacity-60')).not.toBeNull();

        // When: another message comes first, then its own one back, where the room put it
        receive('remote', 'hey');
        echo(transmitSpy);
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hey', 'local: hello\nworld']);
        expect(log().querySelector('.opacity-60')).toBeNull();
        expect(component.unread()).toEqual(0);

        // When: its own message, sent from before a reload
        receive('local', 'earlier');
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hey', 'local: hello\nworld', 'local: earlier']);
    });

    test('should tell a message the room did not send back in time, and send it again', async () => {
        // Given
        // The delay of a message runs on an interval of RxJS
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('hello');
        sendButton().click();
        const sentAt: number = Date.now();

        // When
        vi.advanceTimersByTime(15_000);
        await fixture.whenStable();

        // Then
        expect(log().textContent).toContain('Not sent');
        const retry: HTMLButtonElement = [...log().querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Retry')) as HTMLButtonElement;

        // When
        vi.advanceTimersByTime(1000);
        retry.click();
        await fixture.whenStable();

        // Then: sent again under the same id, waiting
        const first: ChatText = transmitSpy.mock.calls[0][1] as ChatText;
        expect(first.at).toEqual(sentAt);
        expect(transmitSpy).toHaveBeenLastCalledWith(ChatMessengerType.CHAT_MESSAGE, { id: first.id, text: 'hello', at: sentAt + 16_000 });
        expect(logLines()).toEqual(['local: hello']);
        expect(log().textContent).toContain('Sending…');

        // When: the first one comes back at last, then the second one
        echo(transmitSpy, 0);
        echo(transmitSpy, 1);
        await fixture.whenStable();

        // Then: sent, shown once
        expect(logLines()).toEqual(['local: hello']);
        expect(log().querySelector('.opacity-60')).toBeNull();

        // When: no timeout once sent
        vi.advanceTimersByTime(15_000);
        await fixture.whenStable();

        // Then
        expect(log().textContent).not.toContain('Not sent');
        vi.useRealTimers();
    });

    test('should wait before sending a 4th message within 10 seconds, counting down', async () => {
        // Given: a message not sent back, failed, then three sent a second apart
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('lost');
        sendButton().click();
        vi.advanceTimersByTime(15_000);
        for (const text of ['one', 'two', 'three']) {
            await type(text);
            sendButton().click();
            vi.advanceTimersByTime(1000);
        }

        // When
        await type('four');
        press({});
        await fixture.whenStable();

        // Then: the oldest of the three leaves the window in 7 seconds
        const retry = (): HTMLButtonElement => [...log().querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Retry')) as HTMLButtonElement;
        expect(transmitSpy).toHaveBeenCalledTimes(4);
        expect(sendButton().disabled).toEqual(true);
        expect(retry().disabled).toEqual(true);
        expect(query('mat-hint')?.textContent).toEqual('Wait 7 seconds before sending another message');

        // When: the retry of a failed message, activated before the page renders its button disabled
        const failed = TestHelper.cast<{ entries(): ChatEntry[] }>(component).entries().find((entry: ChatEntry) => entry.kind === ChatEntryKind.MESSAGE && entry.state === ChatMessageState.FAILED);
        TestHelper.cast<{ retry(message: ChatEntry | undefined): void }>(component).retry(failed);

        // Then
        expect(transmitSpy).toHaveBeenCalledTimes(4);

        // When: a second after another, each one rendered
        for (let second = 0; second < 6; second++) {
            vi.advanceTimersByTime(1000);
            await fixture.whenStable();
        }

        // Then
        expect(query('mat-hint')?.textContent).toEqual('Wait 1 second before sending another message');

        // When
        vi.advanceTimersByTime(1000);
        await fixture.whenStable();

        // Then
        expect(query('mat-hint')).toBeNull();
        expect(retry().disabled).toEqual(false);

        // When
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(transmitSpy).toHaveBeenCalledTimes(5);
        expect(transmitSpy).toHaveBeenLastCalledWith(ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: 'four', at: Date.now() });
        vi.useRealTimers();
    });

    test('should wait until the room sends back its messages, 5 of them not sent back', async () => {
        // Given: 5 messages the room does not send back, 2 at most within 10 seconds
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        for (const text of ['one', 'two', 'three', 'four', 'five']) {
            await type(text);
            sendButton().click();
            vi.advanceTimersByTime(5000);
        }

        // When
        vi.advanceTimersByTime(15_000);
        await type('six');
        press({});
        await fixture.whenStable();

        // Then: the failed ones may be sent again
        expect(transmitSpy).toHaveBeenCalledTimes(5);
        expect(sendButton().disabled).toEqual(true);
        expect(query('mat-hint')?.textContent).toEqual('Wait until your messages are sent before sending more');
        expect([...log().querySelectorAll('button')].filter((button: HTMLButtonElement) => button.textContent.includes('Retry') && !button.disabled)).toHaveLength(5);

        // When: one sent back
        echo(transmitSpy, 0);
        await fixture.whenStable();

        // Then
        expect(query('mat-hint')).toBeNull();
        expect(sendButton().disabled).toEqual(false);
    });

    test('should show once a message another player sent twice', async () => {
        // Given
        await setRoom();

        // When
        receive('remote', 'hello', 1000, 'message-1');
        receive('remote', 'hello', 2000, 'message-1');
        receive('other', 'hello', 2000, 'message-1');
        await fixture.whenStable();

        // Then: the same id from another author is another message
        expect(logLines()).toEqual(['remote: hello', 'other: hello']);
    });

    test('should show the time the author sent a message, the history of the room included', async () => {
        // Given
        vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 26, 12, 0).getTime());
        await setRoom();

        // When
        receive('remote', 'an hour ago', new Date(2026, 9, 26, 11, 0).getTime());
        receive('remote', 'now');
        await fixture.whenStable();

        // Then: two groups, at the times they were written
        expect([...log().querySelectorAll('time')].map((time: Element) => time.textContent)).toEqual([
            expect.stringMatching(/^11:00\sAM$/), expect.stringMatching(/^12:00\sPM$/),
        ]);
    });

    test('should send with Enter, a new line with Shift, or Ctrl once Enter starts a new line', async () => {
        // Given
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('hello');

        // When
        const newLine: KeyboardEvent = press({ shiftKey: true });
        const composing: KeyboardEvent = press({ isComposing: true });
        press({ key: 'a' });

        // Then
        expect(newLine.defaultPrevented).toEqual(false);
        expect(composing.defaultPrevented).toEqual(false);
        expect(transmitSpy).not.toHaveBeenCalled();

        // When
        const enter: KeyboardEvent = press({});
        await fixture.whenStable();

        // Then
        expect(enter.defaultPrevented).toEqual(true);
        expect(transmitSpy).toHaveBeenCalledWith(ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: 'hello', at: expect.any(Number) });

        // Given: Enter starts a new line
        preferences.enterSends.set(false);
        await type('world');

        // When
        const plainEnter: KeyboardEvent = press({});

        // Then
        expect(plainEnter.defaultPrevented).toEqual(false);
        expect(transmitSpy).toHaveBeenCalledTimes(1);

        // When
        press({ ctrlKey: true });
        await type('!');
        press({ metaKey: true });

        // Then
        expect(transmitSpy).toHaveBeenNthCalledWith(2, ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: 'world', at: expect.any(Number) });
        expect(transmitSpy).toHaveBeenNthCalledWith(3, ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: '!', at: expect.any(Number) });
    });

    test('should not send with the Enter confirming a text composed, which Safari tells after the composition ended', async () => {
        // Given
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('こんにちは');
        const ended = new CompositionEvent('compositionend', { bubbles: true });
        textArea().dispatchEvent(ended);

        // When
        const confirming = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        Object.defineProperty(confirming, 'timeStamp', { value: ended.timeStamp + 50 });
        textArea().dispatchEvent(confirming);

        // Then
        expect(confirming.defaultPrevented).toEqual(false);
        expect(transmitSpy).not.toHaveBeenCalled();

        // When: the next Enter
        const sending = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        Object.defineProperty(sending, 'timeStamp', { value: ended.timeStamp + 500 });
        textArea().dispatchEvent(sending);

        // Then
        expect(transmitSpy).toHaveBeenCalledWith(ChatMessengerType.CHAT_MESSAGE, { id: expect.any(String), text: 'こんにちは', at: expect.any(Number) });
    });

    test('should send neither a blank message nor a too long one', async () => {
        // Given
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);

        // When
        await type('   ');
        press({});

        // Then
        expect(sendButton().disabled).toEqual(true);

        // When
        await type('a'.repeat(1001));
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(transmitSpy).not.toHaveBeenCalled();
        expect(query('mat-error')?.textContent).toContain('1,000 characters at most');
    });

    test('should count the messages received while closed, and show them from the first one once open', async () => {
        // Given
        fixture.componentRef.setInput('open', false);
        await setRoom();
        receive('remote', 'before');
        // Read, the chat closed without unread message: no divider
        fixture.componentRef.setInput('open', true);
        await fixture.whenStable();
        fixture.componentRef.setInput('open', false);
        await fixture.whenStable();
        expect(component.unread()).toEqual(0);

        // When
        receive('remote', 'hello');
        receive('local', 'mine');
        receive('remote', 'world');
        await fixture.whenStable();

        // Then
        expect(component.unread()).toEqual(2);
        expect(query('#unread-divider')?.textContent).toEqual('New messages');
        expect((query('#unread-divider')?.nextElementSibling as HTMLElement).textContent).toContain('remote: hello');

        // When: the chat closed again, still unread
        fixture.componentRef.setInput('open', true);
        fixture.componentRef.setInput('open', false);
        await fixture.whenStable();

        // Then
        expect(query('#unread-divider')).not.toBeNull();

        // When
        fixture.componentRef.setInput('open', true);
        await fixture.whenStable();

        // Then: at the bottom, they are read
        expect(component.unread()).toEqual(0);
        expect(query('#unread-divider')).not.toBeNull();

        // When: a message sent
        vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        await type('ok');
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(query('#unread-divider')).toBeNull();
    });

    test('should scroll to the divider of the new messages once open', async () => {
        // Given
        fixture.componentRef.setInput('open', false);
        await setRoom();
        receive('remote', 'hello');
        await fixture.whenStable();
        Object.defineProperty(query('#unread-divider'), 'offsetTop', { configurable: true, value: 300 });

        // When
        fixture.componentRef.setInput('open', true);
        await fixture.whenStable();

        // Then
        expect(log().scrollTop).toEqual(276);
    });

    test('should not count the history of the room', async () => {
        // Given
        fixture.componentRef.setInput('open', false);
        await setRoom();
        vi.spyOn(room, 'isHistory').mockReturnValueOnce(true);

        // When
        receive('remote', 'before');
        await fixture.whenStable();

        // Then
        expect(component.unread()).toEqual(0);
    });

    test('should tell the new messages while the history is read, and go back to the latest', async () => {
        // Given
        await setRoom();
        receive('remote', 'hello');
        await fixture.whenStable();

        // When
        scrollLog(300);
        await fixture.whenStable();

        // Then
        expect(query('#jump-to-latest')?.textContent).toContain('Latest messages');

        // When
        receive('remote', 'world');
        await fixture.whenStable();

        // Then
        expect(component.unread()).toEqual(1);
        expect(query('#jump-to-latest')?.textContent).toContain('1 new message');

        // When
        (query('#jump-to-latest') as HTMLButtonElement).click();
        await fixture.whenStable();

        // Then
        // jsdom does not hold the scroll within the height of the log
        expect(log().scrollTop).toEqual(1000);
        expect(component.unread()).toEqual(0);
        expect(query('#jump-to-latest')).toBeNull();

        // When: a notice arrives while the history is read
        scrollLog(300);
        network.playerAdded$.next(webRtcPlayer('other', true));
        await fixture.whenStable();

        // Then: the log stays where it is
        expect(log().scrollTop).toEqual(500);
        expect(logLines()).toContain('other joined the room');
    });

    test('should stay at the bottom of the log once it shrinks, not elsewhere', async () => {
        // Given
        let resize: () => void = () => undefined;
        const disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
            private log: boolean = false;

            public constructor(private readonly callback: () => void) {
            }

            // The spec resizes the log itself, nothing else
            public observe(target: Element): void {
                this.log = target.id === 'chat-log';
                if (this.log) {
                    resize = this.callback;
                }
            }

            public disconnect(): void {
                if (this.log) {
                    disconnect();
                }
            }

            public unobserve(): void {
                // Nothing else is resized
            }
        });
        await setRoom();
        scrollLog(0);

        // When: the composer grows, hiding the bottom of the log
        Object.defineProperty(log(), 'scrollHeight', { configurable: true, value: 1100 });
        resize();
        await fixture.whenStable();

        // Then
        expect(log().scrollTop).toEqual(1100);
        expect(query('#jump-to-latest')).toBeNull();

        // When: it shrinks while the history is read
        scrollLog(300);
        resize();
        await fixture.whenStable();

        // Then
        expect(log().scrollTop).toEqual(500);
        expect(query('#jump-to-latest')).not.toBeNull();

        // When
        fixture.destroy();

        // Then
        expect(disconnect).toHaveBeenCalledTimes(1);
    });

    test('should move the divider above the first message unread since the last ones were read', async () => {
        // Given: a message unread, then read, the divider kept
        await setRoom();
        scrollLog(300);
        receive('remote', 'first');
        await fixture.whenStable();
        (query('#jump-to-latest') as HTMLButtonElement).click();
        await fixture.whenStable();
        expect(component.unread()).toEqual(0);
        expect((query('#unread-divider')?.nextElementSibling as HTMLElement).textContent).toContain('remote: first');

        // When
        scrollLog(300);
        receive('remote', 'second');
        receive('remote', 'third');
        await fixture.whenStable();

        // Then
        expect(component.unread()).toEqual(2);
        expect((query('#unread-divider')?.nextElementSibling as HTMLElement).textContent).toContain('remote: second');
    });

    test('should not count the messages unread of a player hidden', async () => {
        // Given
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'carol', isLocal: false }));
        fixture.componentRef.setInput('open', false);
        await setRoom();
        receive('carol', 'one');
        receive('carol', 'two');
        receive('remote', 'hello');
        await fixture.whenStable();
        expect(component.unread()).toEqual(3);

        // When
        const items: HTMLButtonElement[] = await openOptions();
        items.find((item: HTMLButtonElement) => item.textContent.includes('carol'))?.click();
        await fixture.whenStable();

        // Then: the divider above the next message shown
        expect(component.unread()).toEqual(1);
        expect((query('#unread-divider')?.nextElementSibling as HTMLElement).textContent).toContain('remote: hello');

        // When: shown again
        (await openOptions()).find((item: HTMLButtonElement) => item.textContent.includes('carol'))?.click();
        await fixture.whenStable();

        // Then: unread again, though no message was received meanwhile
        expect(component.unread()).toEqual(3);
        expect(component.unreadReceived()).toEqual(3);
    });

    test('should report a message of another form than the one it sends, without showing it', async () => {
        // Given
        await setRoom();
        const reportSpy = vi.spyOn(room, 'reportCheat');

        // When
        deliver('remote', TestHelper.cast<ChatText>({ id: 'x', text: 'hi', at: 'oops' }));
        await fixture.whenStable();

        // Then
        expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ from: 'remote' }), CheatReason.INVALID_MESSAGE);
        expect(logLines()).toEqual(['No messages yet. Say hello!']);
    });

    test('should report the first invalid message of each author only', async () => {
        // Given
        await setRoom();
        const reportSpy = vi.spyOn(room, 'reportCheat');

        // When
        deliver('remote', { id: 'x', text: ' ', at: 0 });
        deliver('remote', { id: 'y', text: 'a'.repeat(1001), at: 0 });
        deliver('other', { id: 'z', text: '', at: 0 });
        await fixture.whenStable();

        // Then
        expect(reportSpy.mock.calls.map(([message]) => message.payload)).toEqual([{ id: 'x', text: ' ', at: 0 }, { id: 'z', text: '', at: 0 }]);
        expect(logLines()).toEqual(['No messages yet. Say hello!']);
    });

    describe('with the times of the chain', () => {
        let chainTime: number;

        beforeEach(() => {
            chainTime = 0;
            vi.spyOn(room, 'sequencedAt').mockImplementation(() => chainTime);
        });

        test('should hide the messages of an author over the rate of the chain, telling it once, until its rate falls back', async () => {
            // Given
            network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
            fixture.componentRef.setInput('open', false);
            await setRoom();
            const messages: string[] = Array.from({ length: 10 }, (_, index: number) => `spam ${ index + 1 }`);

            // When
            messages.forEach((text: string) => receive('remote', text));
            receive('carol', 'stop it');
            await fixture.whenStable();

            // Then: neither shown, nor unread
            const flooding: string = 'remote sends too many messages: they are hidden for a moment';
            expect(logLines()).toEqual([...messages.slice(0, 8).map((text: string) => `remote: ${ text }`), flooding, 'carol: stop it']);
            expect(component.unread()).toEqual(9);
            expect(component.unreadReceived()).toEqual(9);

            // When: its rate fell back
            chainTime = 10_000;
            receive('remote', 'sorry');
            await fixture.whenStable();

            // Then
            expect(logLines().slice(-2)).toEqual(['carol: stop it', 'remote: sorry']);

            // When: the arrivals hidden, then its author
            preferences.arrivals.set(false);
            await fixture.whenStable();
            expect(logLines()).toContain(flooding);
            (await openOptions()).find((item: HTMLButtonElement) => item.textContent.includes('remote'))?.click();
            await fixture.whenStable();

            // Then
            expect(logLines()).toEqual(['carol: stop it']);
        });

        test('should start again the rates and the reports of a room replacing another one', async () => {
            // Given: remote flooding the first room, and reported for an invalid message
            await setRoom();
            const reportSpy = vi.spyOn(room, 'reportCheat');
            Array.from({ length: 9 }, () => receive('remote', 'spam'));
            deliver('remote', { id: 'blank', text: '', at: 0 });
            network = new RoomNetworkMock();
            const nextRoom = new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
            vi.spyOn(nextRoom, 'sequencedAt').mockImplementation(() => chainTime);
            const nextReportSpy = vi.spyOn(nextRoom, 'reportCheat');

            // When: the same in the next room
            fixture.componentRef.setInput('room', nextRoom);
            await fixture.whenStable();
            Array.from({ length: 9 }, () => receive('remote', 'spam'));
            deliver('remote', { id: 'blank', text: '', at: 0 });
            await fixture.whenStable();

            // Then: told and reported again
            expect(logLines().filter((line: string) => line === 'remote sends too many messages: they are hidden for a moment')).toHaveLength(2);
            expect(reportSpy).toHaveBeenCalledTimes(1);
            expect(nextReportSpy).toHaveBeenCalledTimes(1);
        });

        test('should count a message sent twice against the rate of its author, shown once', async () => {
            // Given
            await setRoom();
            receive('remote', 'once', 0, 'twice');
            receive('remote', 'once', 0, 'twice');

            // When: 7 more
            Array.from({ length: 7 }, (_, index: number) => receive('remote', `spam ${ index + 1 }`));
            await fixture.whenStable();

            // Then: the 9th on the chain hidden
            expect(logLines().filter((line: string) => line.startsWith('remote: '))).toHaveLength(7);
            expect(logLines()).toContain('remote sends too many messages: they are hidden for a moment');
        });

        test('should read a message on the room it comes from, the input changed before the next one is listened to', async () => {
            // Given: remote reaching the rate in the first room
            await setRoom();
            const formerNetwork: RoomNetworkMock = network;
            Array.from({ length: 8 }, () => receive('remote', 'spam'));
            network = new RoomNetworkMock();

            // When: one more from the first room, the next room set and not listened to yet
            fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
            formerNetwork.onMessage$.next({
                type: ChatMessengerType.CHAT_MESSAGE, payload: { id: 'late', text: 'late spam', at: 0 }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote',
            });
            await fixture.whenStable();

            // Then: hidden on the times of the first room
            expect(logLines()).not.toContain('remote: late spam');
            expect(logLines()).toContain('remote sends too many messages: they are hidden for a moment');
        });

        test('should leave out its own message hidden for flooding, telling it apart', async () => {
            // Given: its messages before a reload
            await setRoom();
            const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
            const earlier: string[] = Array.from({ length: 8 }, (_, index: number) => `earlier ${ index + 1 }`);
            earlier.forEach((text: string) => receive('local', text, 0));
            await type('hello');
            sendButton().click();
            await fixture.whenStable();

            // When
            echo(transmitSpy);
            await fixture.whenStable();

            // Then
            expect(logLines()).toEqual([...earlier.map((text: string) => `local: ${ text }`), 'You sent too many messages: they are hidden for a moment']);
            expect(log().querySelector('.opacity-60')).toBeNull();
        });
    });

    test('should hide the messages of a player picked in its options', async () => {
        // Given
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        await setRoom();
        receive('remote', 'hello');
        receive('local', 'hi');
        await fixture.whenStable();

        // When
        let items: HTMLButtonElement[] = await openOptions();
        expect(items.map((item: HTMLButtonElement) => [
            item.querySelector('mat-icon')?.textContent, item.querySelector('.mat-mdc-menu-item-text')?.textContent.trim(), item.getAttribute('aria-checked'),
        ])).toEqual([
            ['check_box', 'Show arrivals and departures', 'true'],
            ['check_box', 'Show the times', 'true'],
            ['check_box', 'Send with Enter', 'true'],
            ['check_box', 'remote', 'true'],
        ]);
        items[3].click();
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['local: hi']);
        expect(query('app-chat-participant mat-icon')?.getAttribute('fontIcon')).toEqual('visibility_off');

        // When: hidden, its messages are not unread
        fixture.componentRef.setInput('open', false);
        receive('remote', 'hello?');
        await fixture.whenStable();

        // Then
        expect(component.unread()).toEqual(0);

        // When
        items = await openOptions();
        items[3].click();
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hello', 'local: hi', 'remote: hello?']);
    });

    test('should change the settings from its options', async () => {
        // Given
        await setRoom();

        // When
        for (let index = 0; index < 3; index++) {
            (await openOptions())[index].click();
            await fixture.whenStable();
        }

        // Then
        expect(preferences.arrivals.on()).toEqual(false);
        expect(preferences.times.on()).toEqual(false);
        expect(preferences.enterSends.on()).toEqual(false);
        expect((await openOptions()).map((item: HTMLButtonElement) => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false']);
    });

    test('should stop listening to a room replaced by another one', async () => {
        // Given
        await setRoom();
        const formerNetwork: RoomNetworkMock = network;

        // When
        network = new RoomNetworkMock();
        fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
        await fixture.whenStable();
        formerNetwork.onMessage$.next({
            type: ChatMessengerType.CHAT_MESSAGE, payload: { id: 'former', text: 'hello', at: 0 }, origin: MessageOriginType.ROOM_SERVICE, from: 'remote',
        });
        receive('remote', 'hi');
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['remote: hi']);
    });

    test('should drop the messages a room replaced by another one did not send back', async () => {
        // Given: one message sent back, the other one not
        await setRoom();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        for (const text of ['one', 'two']) {
            await type(text);
            sendButton().click();
        }
        echo(transmitSpy, 0);
        await fixture.whenStable();

        // When
        network = new RoomNetworkMock();
        fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork));
        await fixture.whenStable();

        // Then
        expect(logLines()).toEqual(['local: one']);
    });
});

describe('ChatComponent recompiled from its metadata', () => {
    test('should resolve the query of its log', async () => {
        // Given
        TestBed.configureTestingModule({ imports: [ChatComponent] });
        TestBed.overrideComponent(ChatComponent, { add: { host: { class: 'recompiled' } } });
        const fixture: ComponentFixture<ChatComponent> = TestBed.createComponent(ChatComponent);

        // When
        fixture.componentRef.setInput('room', new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), new RoomNetworkMock().roomNetwork));
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('recompiled');
        expect(fixture.componentInstance['log']().nativeElement.id).toEqual('chat-log');
    });
});

describe('isChatText', () => {
    test('should accept a message of the chat of the form the application sends', () => {
        expect(isChatText({ id: 'x', text: 'a'.repeat(1000), at: 0 })).toEqual(true);
        expect(isChatText({ id: 'x', text: 'hi', at: 8.64e15 })).toEqual(true);
        expect(isChatText({ id: 'x', text: 'hi', at: -8.64e15 })).toEqual(true);
    });

    test('should refuse anything else', () => {
        expect(isChatText(null)).toEqual(false);
        expect(isChatText('hello')).toEqual(false);
        expect(isChatText({ text: 'hi', at: 0 })).toEqual(false);
        expect(isChatText({ id: 'x', text: 1, at: 0 })).toEqual(false);
        expect(isChatText({ id: 'x', text: 'a'.repeat(1001), at: 0 })).toEqual(false);
        expect(isChatText({ id: 'x', text: '', at: 0 })).toEqual(false);
        expect(isChatText({ id: 'x', text: ' \n\t', at: 0 })).toEqual(false);
        expect(isChatText({ id: 'x', text: 'hi', at: '0' })).toEqual(false);
        expect(isChatText({ id: 'x', text: 'hi', at: Number.NaN })).toEqual(false);
        expect(isChatText({ id: 'x', text: 'hi', at: Number.POSITIVE_INFINITY })).toEqual(false);
        // Out of the dates: formatting it would throw
        expect(isChatText({ id: 'x', text: 'hi', at: 8.64e15 + 1 })).toEqual(false);
    });
});
