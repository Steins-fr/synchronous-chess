import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageComponent } from './chat-message.component';
import { beforeEach, describe, expect, test } from 'vitest';

describe('ChatMessageComponent', () => {
    let fixture: ComponentFixture<ChatMessageComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChatMessageComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChatMessageComponent);
    });

    test('should display the author and the message', async () => {
        // When
        fixture.componentRef.setInput('message', { author: 'remote', message: 'hello', isSelf: false });
        await fixture.whenStable();

        // Then
        const author: HTMLElement = fixture.nativeElement.querySelector('.author');
        expect(author.textContent).toEqual('remote :');
        expect(author.classList).not.toContain('my-message');
        expect(fixture.nativeElement.textContent).toContain('hello');
    });

    test('should highlight my messages', async () => {
        // When
        fixture.componentRef.setInput('message', { author: 'local', message: 'hello', isSelf: true });
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('.author').classList).toContain('my-message');
    });
});
