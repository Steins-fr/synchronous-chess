import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatEntryKind, ChatMessage, ChatMessageComponent, ChatMessageState } from './chat-message.component';
import { beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChatMessageComponent', () => {
    let fixture: ComponentFixture<ChatMessageComponent>;

    function message(changes: Partial<ChatMessage> = {}): ChatMessage {
        return { id: 0, kind: ChatEntryKind.MESSAGE, messageId: 'message-1', author: 'remote', text: 'hello', isSelf: false, at: 0, state: ChatMessageState.SENT, ...changes };
    }

    function bubble(): HTMLElement {
        return fixture.nativeElement.querySelector('.chat-bubble');
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChatMessageComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChatMessageComponent);
    });

    test('should show the author and the time above the first message of a group, on the left', async () => {
        // When
        fixture.componentRef.setInput('message', message());
        fixture.componentRef.setInput('time', '10:42');
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.text-app-chat-author').textContent).toEqual('remote');
        expect(fixture.nativeElement.querySelector('time').textContent).toEqual('10:42');
        expect(bubble().textContent).toEqual('remote: hello');
        expect(bubble().classList).not.toContain('chat-bubble-self');
        expect(fixture.nativeElement.classList).toContain('items-start');
        expect(fixture.nativeElement.classList).toContain('mt-3');
    });

    test('should show the next messages of a group without their author', async () => {
        // When
        fixture.componentRef.setInput('message', message());
        fixture.componentRef.setInput('startsGroup', false);
        fixture.componentRef.setInput('time', '10:42');
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.text-app-chat-author')).toBeNull();
        expect(fixture.nativeElement.querySelector('time')).toBeNull();
        expect(fixture.nativeElement.classList).toContain('mt-0.5');
    });

    test('should show my messages on the right, without my name, waiting until sent', async () => {
        // When
        fixture.componentRef.setInput('message', message({ author: 'local', isSelf: true, state: ChatMessageState.SENDING }));
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.text-app-chat-author')).toBeNull();
        expect(fixture.nativeElement.querySelector('.px-1')?.textContent.trim()).toEqual('Sending…');
        expect(bubble().classList).toContain('chat-bubble-self');
        expect(bubble().classList).toContain('opacity-60');
        expect(fixture.nativeElement.classList).toContain('items-end');

        // When
        fixture.componentRef.setInput('message', message({ author: 'local', isSelf: true }));
        fixture.componentRef.setInput('time', '10:42');
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('time').textContent).toEqual('10:42');
        expect(bubble().classList).not.toContain('opacity-60');
    });

    test('should offer to send again a message the room did not send back', async () => {
        // Given
        const retry = vi.fn();
        fixture.componentInstance.retry.subscribe(retry);
        fixture.componentRef.setInput('message', message({ author: 'local', isSelf: true, state: ChatMessageState.FAILED }));
        await fixture.whenStable();

        // When
        (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Not sent');
        expect(bubble().classList).toContain('opacity-60');
        expect(retry).toHaveBeenCalledTimes(1);
    });

    test('should disable its retry while the composer waits', async () => {
        // Given
        fixture.componentRef.setInput('message', message({ author: 'local', isSelf: true, state: ChatMessageState.FAILED }));

        // When
        fixture.componentRef.setInput('retryDisabled', true);
        await fixture.whenStable();

        // Then
        expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toEqual(true);
    });
});
