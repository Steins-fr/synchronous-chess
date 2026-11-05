import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { textAreaFieldInput } from '@testing/text-field.helper';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { chatMessageRules } from '../chat.component';
import { ChatComposerComponent } from './chat-composer.component';

@Component({
    imports: [ChatComposerComponent],
    template: '<app-chat-composer (send)="sent.set(sent() + 1)" [disabled]="disabled()" [field]="messageForm" [formId]="formId()" [hint]="hint()" '
        + '[sendId]="sendId()" label="Your message" sendLabel="Send it" />',
})
class HostComponent {
    public readonly message = signal<string>('');
    public readonly messageForm = form(this.message, chatMessageRules, { name: 'composer-message' });
    public readonly hint = signal<TranslatableText | undefined>(undefined);
    public readonly disabled = signal<boolean>(false);
    public readonly formId = signal<string>('send-form');
    public readonly sendId = signal<string>('send');
    public readonly sent = signal<number>(0);
}

@Component({
    imports: [ChatComposerComponent],
    template: '<app-chat-composer [field]="messageForm" label="Your message" sendLabel="Send it" />',
})
class DefaultHostComponent {
    public readonly messageForm = form(signal<string>(''), chatMessageRules, { name: 'composer-message' });
}

describe('ChatComposerComponent', () => {
    let fixture: ComponentFixture<HostComponent>;
    let host: HostComponent;
    let preferences: ChatPreferencesService;

    function textArea(): HTMLTextAreaElement {
        return textAreaFieldInput(fixture.nativeElement, 'Your message');
    }

    function sendButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('app-chat-composer button');
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

    beforeEach(async () => {
        localStorage.clear();
        preferences = TestBed.inject(ChatPreferencesService);
        fixture = TestBed.createComponent(HostComponent);
        host = fixture.componentInstance;
        await fixture.whenStable();
    });

    afterEach(() => {
        localStorage.clear();
    });

    test('should show the text area and the button sending, under the ids of the chat by default', async () => {
        // Given
        const defaultFixture: ComponentFixture<DefaultHostComponent> = TestBed.createComponent(DefaultHostComponent);

        // When
        await defaultFixture.whenStable();

        // Then
        const element: HTMLElement = defaultFixture.nativeElement;
        expect(element.querySelector('#send-form app-text-area-field')).not.toBeNull();
        const button = element.querySelector('#send') as HTMLButtonElement;
        expect(button.getAttribute('aria-label')).toEqual('Send it');
        expect(button.title).toEqual('Send it');
        expect(button.disabled).toEqual(false);
        expect(element.querySelector('mat-hint')).toBeNull();
    });

    test('should give the typed text to its field, show its hint and its ids, and disable its button', async () => {
        // When
        await type('hello');
        host.hint.set({ key: 'chat.composer.wait', params: { seconds: 7 } });
        host.disabled.set(true);
        host.formId.set('private-send-form');
        host.sendId.set('private-send');
        await fixture.whenStable();

        // Then
        expect(host.message()).toEqual('hello');
        expect(fixture.nativeElement.querySelector('mat-hint').textContent).toEqual('Wait 7 seconds before sending another message');
        expect(fixture.nativeElement.querySelector('#private-send-form')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#send-form')).toBeNull();
        expect(sendButton().id).toEqual('private-send');
        expect(sendButton().disabled).toEqual(true);
    });

    test('should tell to send on a click of its button', async () => {
        // When
        sendButton().click();
        await fixture.whenStable();

        // Then
        expect(host.sent()).toEqual(1);
    });

    test('should send with Enter, a new line with Shift, or Ctrl once Enter starts a new line', async () => {
        // Given
        await type('hello');

        // When
        const newLine: KeyboardEvent = press({ shiftKey: true });
        const composing: KeyboardEvent = press({ isComposing: true });
        const other: KeyboardEvent = press({ key: 'a' });

        // Then
        expect(newLine.defaultPrevented).toEqual(false);
        expect(composing.defaultPrevented).toEqual(false);
        expect(other.defaultPrevented).toEqual(false);
        expect(host.sent()).toEqual(0);

        // When
        const enter: KeyboardEvent = press({});

        // Then
        expect(enter.defaultPrevented).toEqual(true);
        expect(host.sent()).toEqual(1);

        // Given: Enter starts a new line
        preferences.enterSends.set(false);

        // When
        const plainEnter: KeyboardEvent = press({});

        // Then
        expect(plainEnter.defaultPrevented).toEqual(false);
        expect(host.sent()).toEqual(1);

        // When
        const ctrlEnter: KeyboardEvent = press({ ctrlKey: true });
        const metaEnter: KeyboardEvent = press({ metaKey: true });

        // Then
        expect(ctrlEnter.defaultPrevented).toEqual(true);
        expect(metaEnter.defaultPrevented).toEqual(true);
        expect(host.sent()).toEqual(3);
    });

    test('should not send with the Enter confirming a text composed, which Safari tells after the composition ended', async () => {
        // Given
        await type('こんにちは');
        const ended = new CompositionEvent('compositionend', { bubbles: true });
        textArea().dispatchEvent(ended);

        // When
        const confirming = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        Object.defineProperty(confirming, 'timeStamp', { value: ended.timeStamp + 50 });
        textArea().dispatchEvent(confirming);

        // Then
        expect(confirming.defaultPrevented).toEqual(false);
        expect(host.sent()).toEqual(0);

        // When: the next Enter
        const sending = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        Object.defineProperty(sending, 'timeStamp', { value: ended.timeStamp + 500 });
        textArea().dispatchEvent(sending);

        // Then
        expect(sending.defaultPrevented).toEqual(true);
        expect(host.sent()).toEqual(1);
    });
});
