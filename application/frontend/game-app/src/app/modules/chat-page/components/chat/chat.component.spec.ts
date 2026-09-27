import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ChatComponent, ChatMessengerType, ChatPayloads } from './chat.component';
import { ChatMessage } from './chat-message/chat-message.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Player } from '@app/services/room-manager/classes/player/player';
import { Room } from '@app/services/room-manager/classes/room/room';
import MessageOriginType from '@app/services/room-manager/classes/webrtc/messages/message-origin.types';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChatComponent', () => {
    let fixture: ComponentFixture<ChatComponent>;
    let component: ChatComponent;
    let network: RoomNetworkMock;
    let room: Room<ChatPayloads>;

    function receive(from: string, payload: string): void {
        network.onMessage$.next({ type: ChatMessengerType.CHAT_MESSAGE, payload, origin: MessageOriginType.ROOM_SERVICE, from });
    }

    function chatMessages(): ReadonlyArray<ChatMessage> {
        return TestHelper.cast<{ chatMessages(): ReadonlyArray<ChatMessage> }>(component).chatMessages();
    }

    function viewport(): CdkVirtualScrollViewport {
        return fixture.debugElement.query(By.directive(CdkVirtualScrollViewport)).componentInstance;
    }

    function sendButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#send');
    }

    function sendInput(): HTMLInputElement {
        return fixture.nativeElement.querySelector('#send-form input');
    }

    beforeEach(async () => {
        // jsdom does not implement scrolling
        Element.prototype.scrollTo ??= (): void => undefined;
        await TestBed.configureTestingModule({
            imports: [ChatComponent],
        }).compileComponents();

        network = new RoomNetworkMock();
        room = new Room<ChatPayloads>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        fixture = TestBed.createComponent(ChatComponent);
        component = fixture.componentInstance;
    });

    test('should wait for a room', async () => {
        // When
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('h4:not(.list-title)')).toBeNull();
        expect(fixture.nativeElement.querySelector('#player-list').textContent).toContain('0 participant(s) dans la salle');
        expect(sendButton().disabled).toEqual(true);
        expect(() => component.roomName).toThrow('Room not found');
    });

    test('should display the room and its participants', async () => {
        // Given
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();

        // When
        network.playerAdded$.next(TestHelper.cast<Player>({ name: 'remote', isLocal: false }));
        network.queueAdded$.next('pending');
        await fixture.whenStable();

        // Then
        expect(component.roomName).toEqual('room');
        expect(component.localPlayer).toBe(network.localPlayer);
        expect(fixture.nativeElement.textContent).toContain('Salle (room)');
        expect(fixture.nativeElement.querySelector('#player-list').textContent).toContain('2 participant(s) dans la salle');
        expect(fixture.nativeElement.querySelectorAll('app-chat-participant')).toHaveLength(2);
        const chips: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('mat-chip');
        expect(chips[chips.length - 1].textContent).toContain('pending');
    });

    test('should add the received messages and scroll down', async () => {
        // Given
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        const scrollToSpy = vi.spyOn(viewport(), 'scrollTo').mockImplementation(() => undefined);

        // When
        receive('remote', 'hello');
        receive('remote', 'world');
        await fixture.whenStable();

        // Then
        expect(chatMessages()).toEqual([
            { author: 'remote', message: 'hello', isSelf: false },
            { author: 'remote', message: 'world', isSelf: false },
        ]);
        expect(scrollToSpy).toHaveBeenCalledWith({ bottom: 0 });
        expect(fixture.nativeElement.querySelector('#new-message-notification')).toBeNull();
    });

    test('should notify the new messages while viewing the history', async () => {
        // Given
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        const measureSpy = vi.spyOn(viewport(), 'measureScrollOffset').mockReturnValue(100);
        const scrollToSpy = vi.spyOn(viewport(), 'scrollTo').mockImplementation(() => undefined);

        // When
        viewport().elementRef.nativeElement.dispatchEvent(new Event('scroll'));
        viewport().elementRef.nativeElement.dispatchEvent(new Event('scroll'));
        receive('remote', 'hello');
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#history-notification')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#new-message-notification').textContent).toContain('1 nouveaux messages');
        expect(scrollToSpy).not.toHaveBeenCalled();

        // When
        (fixture.nativeElement.querySelector('#new-message-notification button') as HTMLButtonElement).click();
        await fixture.whenStable();

        // Then
        expect(scrollToSpy).toHaveBeenCalledWith({ bottom: 0 });
        expect(fixture.nativeElement.querySelector('#new-message-notification')).toBeNull();

        // When
        (fixture.nativeElement.querySelector('#history-notification button') as HTMLButtonElement).click();
        measureSpy.mockReturnValue(0);
        viewport().elementRef.nativeElement.dispatchEvent(new Event('scroll'));
        await fixture.whenStable();

        // Then
        expect(scrollToSpy).toHaveBeenCalledTimes(2);
        expect(fixture.nativeElement.querySelector('#history-notification')).toBeNull();
    });

    test('should send a message and wait for its reception', async () => {
        // Given
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        const transmitSpy = vi.spyOn(room, 'transmitMessage').mockImplementation(() => undefined);
        sendInput().value = 'hello';
        sendInput().dispatchEvent(new Event('input'));

        // When
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(transmitSpy).toHaveBeenCalledWith(ChatMessengerType.CHAT_MESSAGE, 'hello');
        expect(sendButton().disabled).toEqual(true);
        expect(sendInput().disabled).toEqual(true);

        // When
        receive('local', 'hello');
        await fixture.whenStable();

        // Then
        expect(sendButton().disabled).toEqual(false);
        expect(sendInput().disabled).toEqual(false);
        expect(sendInput().value).toEqual('');
        expect(chatMessages()).toEqual([{ author: 'local', message: 'hello', isSelf: true }]);
    });

    test('should stop listening to a removed room', async () => {
        // Given
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();

        // When
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();
        receive('remote', 'hello');

        // Then
        expect(chatMessages()).toEqual([]);
    });
});

describe('ChatComponent recompiled from its metadata', () => {
    test('should resolve its virtual scroll viewport query', async () => {
        // Given
        Element.prototype.scrollTo ??= (): void => undefined;
        TestBed.configureTestingModule({ imports: [ChatComponent] });
        TestBed.overrideComponent(ChatComponent, { add: { host: { class: 'recompiled' } } });
        const fixture: ComponentFixture<ChatComponent> = TestBed.createComponent(ChatComponent);

        // When
        fixture.componentRef.setInput('room', undefined);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('recompiled');
        expect(fixture.componentInstance.virtualScrollViewport()).toBeInstanceOf(CdkVirtualScrollViewport);
    });
});
