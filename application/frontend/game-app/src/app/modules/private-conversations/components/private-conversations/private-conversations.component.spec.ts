import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { ChatMessageState } from '@app/modules/chat-page/components/chat/chat-message/chat-message.component';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { ParticipantKeyStore } from '@app/services/room-manager/classes/room/block-room/block-chain/participant-key-store';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { privateConversation, PrivateConversationsMock, privateMessage, privateNotice } from '@testing/private-conversations.mock';
import { RoomHub } from '@testing/room-hub';
import { TestHelper } from '@testing/test.helper';
import { textAreaFieldInput } from '@testing/text-field.helper';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, MockInstance, test, vi } from 'vitest';
import {
    PrivateComposerWait,
    PrivateConversations,
    PrivateConversationView,
    PrivateLine,
    PrivateLineKind
} from '../../classes/private-conversations';
import { PrivatePayloads } from '../../classes/private-messages';
import { PrivateConversationsComponent } from './private-conversations.component';

@Component({
    imports: [PrivateConversationsComponent],
    template: '<app-private-conversations (closed)="closes.set(closes() + 1)" [conversations]="conversations()" [mutedUntil]="mutedUntil()" [open]="open()" />',
})
class HostComponent {
    public readonly conversations = signal<PrivateConversations>(new PrivateConversationsMock().conversations);
    public readonly open = signal<boolean>(true);
    public readonly mutedUntil = signal<number | undefined>(undefined);
    public readonly closes = signal<number>(0);
}

describe('PrivateConversationsComponent', () => {
    let fixture: ComponentFixture<HostComponent>;
    let fake: PrivateConversationsMock;
    let component: PrivateConversationsComponent;
    let play: MockInstance<SoundService['play']>;

    function query<E extends Element = HTMLElement>(selector: string): E | null {
        return fixture.nativeElement.querySelector(selector);
    }

    function texts(selector: string): string[] {
        return [...fixture.nativeElement.querySelectorAll(selector)].map((element: Element) => element.textContent.trim());
    }

    function tabIds(): string[] {
        return [...fixture.nativeElement.querySelectorAll('[role="tab"]')].map((tab: Element) => tab.id);
    }

    function tab(id: string): HTMLButtonElement {
        return query(`#private-conversation-${ id }`) as HTMLButtonElement;
    }

    function selectedTab(): string | undefined {
        return query('[role="tab"][aria-selected="true"]')?.id;
    }

    function textArea(label: string): HTMLTextAreaElement {
        return textAreaFieldInput(fixture.nativeElement, label);
    }

    function sendButton(): HTMLButtonElement {
        return query('#private-send') as HTMLButtonElement;
    }

    function hint(): string | undefined {
        return query('#private-send-form mat-hint')?.textContent.trim();
    }

    async function type(label: string, text: string): Promise<void> {
        textArea(label).value = text;
        textArea(label).dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    async function show(...conversations: ReadonlyArray<PrivateConversationView>): Promise<void> {
        fake.shown.set(conversations);
        await fixture.whenStable();
    }

    async function click(button: HTMLButtonElement): Promise<void> {
        button.click();
        await fixture.whenStable();
    }

    beforeEach(async () => {
        localStorage.clear();
        await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
        const transloco: TranslocoService = TestBed.inject(TranslocoService);
        transloco.setTranslationKey('test.team', 'Team');
        transloco.setTranslationKey('test.customs', 'Customs {round}');
        transloco.setTranslationKey('test.old', 'Old customs');
        transloco.setTranslationKey('test.older', 'Older customs');
        for (const round of [1, 2, 3]) {
            transloco.setTranslationKey(`test.customs-${ round }`, `Customs ${ round }`);
        }
        play = vi.spyOn(TestBed.inject(SoundService), 'play').mockImplementation(() => undefined);

        fixture = TestBed.createComponent(HostComponent);
        fake = TestHelper.cast<PrivateConversationsMock>(fixture.componentInstance.conversations());
        await fixture.whenStable();
        component = fixture.debugElement.children[0].componentInstance;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should tell when the local player has no private conversation, closed by its own button', async () => {
        // Then
        expect(query('#private-conversations h2')?.textContent).toEqual('Private conversations');
        expect(query('[role="tablist"]')).toBeNull();
        expect(query('#private-log')?.textContent.trim()).toEqual('No private conversation for now');
        expect(query('app-chat-composer')).toBeNull();
        expect(component.unread()).toEqual(0);
        // Nothing to show nor to send
        expect(component['lines']()).toEqual([]);
        expect(component['recipients']()).toEqual('');
        expect(component['wait']()).toBeUndefined();

        // When
        const close: HTMLButtonElement = query('#private-close') as HTMLButtonElement;
        await click(close);

        // Then
        expect(close.getAttribute('aria-label')).toEqual('Close the private conversations');
        expect(fixture.componentInstance.closes()).toEqual(1);
    });

    test('should not ring for the messages there before the panel', async () => {
        // Given: a panel created closed, for conversations holding a message received already
        const conversations = new PrivateConversationsMock();
        conversations.shown.set([
            privateConversation('team', ['alice', 'bob'], [privateMessage('bob', 'before')]),
        ]);
        const other: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
        other.componentInstance.conversations.set(conversations.conversations);
        other.componentInstance.open.set(false);

        // When
        await other.whenStable();

        // Then
        const panel: PrivateConversationsComponent = other.debugElement.children[0].componentInstance;
        expect(panel.unreadReceived()).toEqual(0);
        expect(play).not.toHaveBeenCalled();
    });

    test('should show a tab per conversation, the open ones first, the latest declared first, then the closed ones', async () => {
        // When
        await show(
            privateConversation('old', ['alice', 'bob'], [], false),
            privateConversation('team', ['alice', 'carol']),
            privateConversation('older', ['alice', 'bob'], [], false),
            { ...privateConversation('customs', ['alice', 'bob', 'dave']), title: { key: 'test.customs', params: { round: 3 } } },
        );

        // Then: the first tab selected
        expect(tabIds()).toEqual(['private-conversation-customs', 'private-conversation-team', 'private-conversation-older', 'private-conversation-old']);
        expect(texts('[role="tab"] span:first-child')).toEqual(['Customs 3', 'Team', 'Older customs', 'Old customs']);
        expect(texts('[role="tab"] .sr-only')).toEqual(['Closed', 'Closed']);
        expect(query('#private-conversation-old mat-icon')?.getAttribute('aria-hidden')).toEqual('true');
        expect(selectedTab()).toEqual('private-conversation-customs');
        expect(tab('team').getAttribute('aria-selected')).toEqual('false');
        expect(tab('team').getAttribute('aria-controls')).toEqual('private-log');
        expect(query('#private-log')?.getAttribute('role')).toEqual('log');
        // The composer names the recipients
        expect(textArea('Message to bob, dave')).not.toBeNull();
        expect(sendButton().getAttribute('aria-label')).toEqual('Send privately');
        expect(query('#private-log')?.textContent.trim()).toEqual('No messages yet');

        // When
        await click(tab('old'));

        // Then: closed, read only
        expect(selectedTab()).toEqual('private-conversation-old');
        expect(query('#private-closed')?.textContent).toEqual('This conversation is closed: it can still be read');
        expect(textArea('Message to bob')).not.toBeNull();
    });

    test('should show the lines of the conversation selected, its messages grouped by author, its notices worded for the local player', async () => {
        // Given
        const now: number = Date.now();
        TestBed.inject(ChatPreferencesService).times.set(false);

        // When
        await show(privateConversation('team', ['alice', 'bob', 'carol'], [
            privateMessage('bob', 'one', { at: now - 20 * 60 * 1000 }),
            privateMessage('bob', 'two', { at: now - 19 * 60 * 1000 }),
            privateMessage('bob', 'three', { at: now - 10 * 60 * 1000 }),
            privateNotice(PrivateLineKind.FLOOD, 'bob'),
            privateMessage('bob', 'four', { at: now }),
            privateNotice(PrivateLineKind.FLOOD, 'alice'),
            privateNotice(PrivateLineKind.UNREADABLE, 'carol'),
            privateNotice(PrivateLineKind.UNREADABLE, 'alice'),
            privateMessage('alice', 'mine', { at: now }),
            privateMessage('carol', 'fuck that', { at: now }),
        ]));

        // Then: a new group after a pause, or a notice
        expect(texts('#private-log app-chat-message .text-app-chat-author')).toEqual(['bob', 'bob', 'bob', 'carol']);
        expect(texts('#private-log .chat-bubble')).toEqual(['bob: one', 'bob: two', 'bob: three', 'bob: four', 'alice: mine', 'carol: f*** that']);
        expect(texts('#private-log .chat-notice')).toEqual([
            'bob sends too many messages: they are hidden for a moment',
            'You sent too many messages: they are hidden for a moment',
            'A message from carol cannot be read in this browser',
            'One of your messages cannot be read in this browser',
        ]);
        expect(query('#private-log time')).toBeNull();

        // When: the times shown
        TestBed.inject(ChatPreferencesService).times.set(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelectorAll('#private-log time')).toHaveLength(5);
    });

    test('should tell why the composer waits', async () => {
        // Given
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        await show(privateConversation('team', ['alice', 'bob']));
        await type('Message to bob', 'hello');

        // Then
        expect(hint()).toBeUndefined();
        expect(sendButton().disabled).toEqual(false);

        for (const [wait, text] of [
            [PrivateComposerWait.CLOSED, 'The conversation is closed: no more messages'],
            [PrivateComposerWait.KEYS, 'Preparing the encryption…'],
            [PrivateComposerWait.UNSENT, 'Wait until your messages are sent before sending more'],
        ] as const) {
            // When
            fake.wait.set(wait);
            await fixture.whenStable();

            // Then
            expect(hint()).toEqual(text);
            expect(sendButton().disabled).toEqual(true);
        }

        // When: too many messages sent, counting down
        fake.wait.set(undefined);
        fake.until.set(Date.now() + 6500);
        textArea('Message to bob').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
        await fixture.whenStable();

        // Then
        expect(hint()).toEqual('Wait 7 seconds before sending another message');
        expect(sendButton().disabled).toEqual(true);

        // When
        vi.advanceTimersByTime(500);
        await fixture.whenStable();
        for (let second = 0; second < 5; second++) {
            vi.advanceTimersByTime(1000);
            await fixture.whenStable();
        }

        // Then
        expect(hint()).toEqual('Wait 1 second before sending another message');

        // When
        vi.advanceTimersByTime(1000);
        await fixture.whenStable();

        // Then
        expect(hint()).toBeUndefined();
        expect(sendButton().disabled).toEqual(false);
    });

    test('should send the draft of the conversation shown, emptied once sent', async () => {
        // Given
        await show(privateConversation('team', ['alice', 'bob']));

        // When: blank
        await type('Message to bob', '   ');
        component['send']();

        // Then
        expect(sendButton().disabled).toEqual(true);
        expect(fake.send).not.toHaveBeenCalled();

        // When
        await type('Message to bob', 'I put 7');
        await click(sendButton());

        // Then
        expect(fake.send).toHaveBeenCalledExactlyOnceWith('team', 'I put 7');
        expect(textArea('Message to bob').value).toEqual('');

        // When: refused by the conversations
        fake.send.mockReturnValue(false);
        await type('Message to bob', 'again');
        await click(sendButton());

        // Then: kept
        expect(fake.send).toHaveBeenCalledTimes(2);
        expect(textArea('Message to bob').value).toEqual('again');

        // When: waiting, Enter sending
        fake.wait.set(PrivateComposerWait.KEYS);
        await fixture.whenStable();
        textArea('Message to bob').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
        await fixture.whenStable();

        // Then
        expect(fake.send).toHaveBeenCalledTimes(2);
    });

    test('should show a watched conversation to a spectator, without composer', async () => {
        // When
        await show(privateConversation('team', ['bob', 'carol'], [privateMessage('bob', 'the ball is on 3')], true, true));

        // Then
        expect(query('#private-conversations h2')?.textContent).toEqual('Conversation of the players');
        expect(query('[role="tablist"]')?.getAttribute('aria-label')).toEqual('Conversation of the players');
        expect(query('#private-log')?.getAttribute('aria-label')).toEqual('Conversation of the players');
        expect(query('#private-close')?.getAttribute('aria-label')).toEqual('Close the conversation of the players');
        expect(texts('#private-conversation-team mat-icon')).toEqual(['visibility']);
        expect(texts('#private-conversation-team .sr-only')).toEqual(['Read by the whole room']);
        expect(texts('.chat-bubble')).toHaveLength(1);
        expect(query('app-chat-composer')).toBeNull();
        expect(query('#private-read-only')?.textContent.trim()).toEqual('Only the players write here');

        // When: the match over
        await show(privateConversation('team', ['bob', 'carol'], [], false, true));

        // Then
        expect(texts('#private-conversation-team mat-icon')).toEqual(['visibility', 'lock_clock']);
        expect(texts('#private-conversation-team .sr-only')).toEqual(['Read by the whole room', 'Closed']);
        expect(query('#private-closed')).not.toBeNull();
    });

    test('should send openly in a watched conversation of the local player', async () => {
        // Given
        await show(privateConversation('team', ['alice', 'bob'], [], true, true));

        // When
        await type('Message to bob, read by the whole room', 'I bet on 2');
        await click(sendButton());

        // Then
        expect(sendButton().getAttribute('aria-label')).toEqual('Send openly');
        expect(fake.send).toHaveBeenCalledExactlyOnceWith('team', 'I bet on 2');
        expect(query('#private-read-only')).toBeNull();
    });

    test('should wait while the local player is muted in the chat, in a watched conversation only', async () => {
        // Given
        await show(privateConversation('team', ['alice', 'bob'], [privateMessage('alice', 'failed', { state: ChatMessageState.FAILED })], true, true));

        // When
        fixture.componentInstance.mutedUntil.set(Date.now() + 60_000);
        await type('Message to bob, read by the whole room', 'I bet on 2');

        // Then
        expect(hint()).toMatch(/^You are muted until /);
        expect(sendButton().disabled).toEqual(true);
        const retry: HTMLButtonElement | undefined = [...fixture.nativeElement.querySelectorAll('app-chat-message button')]
            .find((button: HTMLButtonElement) => button.textContent.trim() === 'Retry');
        expect(retry?.disabled).toEqual(true);

        // When
        fixture.componentInstance.mutedUntil.set(Number.POSITIVE_INFINITY);
        await fixture.whenStable();

        // Then
        expect(hint()).toEqual('You are muted until the end of the room');

        // When: the conversation closed
        fake.wait.set(PrivateComposerWait.CLOSED);
        await show(privateConversation('team', ['alice', 'bob'], [], false, true));

        // Then
        expect(hint()).toEqual('The conversation is closed: no more messages');

        // When: a private conversation
        fake.wait.set(undefined);
        await show(privateConversation('team', ['alice', 'bob']));

        // Then
        expect(hint()).toBeUndefined();
        expect(sendButton().disabled).toEqual(false);
    });

    test('should tell the private conversations beside a watched one', async () => {
        // When
        await show(privateConversation('team', ['alice', 'bob']), privateConversation('customs-1', ['alice', 'bob'], [], true, true));

        // Then
        expect(query('#private-conversations h2')?.textContent).toEqual('Private conversations');
        expect(query('#private-close')?.getAttribute('aria-label')).toEqual('Close the private conversations');
    });

    test('should not send without a conversation shown', async () => {
        // Given
        await show(privateConversation('team', ['alice', 'bob']));
        await type('Message to bob', 'hello');

        // When: the conversation gone
        await show();
        component['send']();

        // Then
        expect(fake.send).not.toHaveBeenCalled();
    });

    test('should keep a draft for each conversation', async () => {
        // Given
        await show(privateConversation('team', ['alice', 'carol']), privateConversation('customs', ['alice', 'bob']));
        await type('Message to bob', 'I put 7');

        // When
        await click(tab('team'));

        // Then
        expect(textArea('Message to carol').value).toEqual('');

        // When
        await type('Message to carol', 'he lies');
        await click(tab('customs'));

        // Then
        expect(textArea('Message to bob').value).toEqual('I put 7');

        // When
        await click(tab('team'));

        // Then
        expect(textArea('Message to carol').value).toEqual('he lies');
    });

    test('should never move the selection by itself while a draft is written', async () => {
        // Given: a draft to the team
        const team: PrivateConversationView = privateConversation('team', ['alice', 'carol']);
        const customs: PrivateConversationView = privateConversation('customs-1', ['alice', 'bob']);
        await show(team);
        await type('Message to carol', 'he lies');

        // When: a customs opens, then the team closes
        await show(team, customs);
        await show({ ...team, open: false }, customs);

        // Then
        expect(selectedTab()).toEqual('private-conversation-team');
        expect(textArea('Message to carol').value).toEqual('he lies');

        // When: the draft sent, the team still closed
        await type('Message to carol', '');
        await show({ ...team, open: false, lines: [privateMessage('bob', 'read')] }, customs);

        // Then: kept, closed before
        expect(selectedTab()).toEqual('private-conversation-team');

        // When: the customs selected, then closed without draft as another one opens
        await click(tab('customs-1'));
        await show({ ...team, open: false }, { ...customs, open: false }, privateConversation('customs-2', ['alice', 'bob']));

        // Then: the first tab
        expect(selectedTab()).toEqual('private-conversation-customs-2');

        // When: a closed one picked, another one opening
        await click(tab('customs-1'));
        await show({ ...team, open: false }, { ...customs, open: false }, privateConversation('customs-2', ['alice', 'bob']), privateConversation('customs-3', ['alice', 'bob']));

        // Then
        expect(selectedTab()).toEqual('private-conversation-customs-1');

        // When: gone
        await show(privateConversation('customs-3', ['alice', 'bob']));

        // Then
        expect(selectedTab()).toEqual('private-conversation-customs-3');
    });

    test('should count the messages of the others not seen, on their tab, ringing', async () => {
        // Given: the panel closed
        fixture.componentInstance.open.set(false);
        const team: PrivateConversationView = privateConversation('team', ['alice', 'bob', 'carol']);
        const customs: PrivateConversationView = privateConversation('customs', ['alice', 'bob']);
        await show(team, customs);

        // When: received, its own and replayed ones not counted
        const hello: PrivateLine = privateMessage('bob', 'hello');
        await show({ ...team, lines: [privateMessage('bob', 'before', { live: false }), privateMessage('alice', 'mine'), hello, privateNotice(PrivateLineKind.FLOOD, 'bob')] }, customs);

        // Then
        expect(component.unread()).toEqual(1);
        expect(component.unreadReceived()).toEqual(1);
        expect(texts('#private-conversation-team .badge')).toEqual(['1']);
        expect(tab('team').textContent).toContain('1 unread message');
        expect(play).toHaveBeenCalledExactlyOnceWith(SoundEffect.CHAT_MESSAGE);

        // When: the panel opened on the customs, two messages received in the team
        fixture.componentInstance.open.set(true);
        await fixture.whenStable();
        const lines: ReadonlyArray<PrivateLine> = [hello, privateMessage('carol', 'one'), privateMessage('bob', 'two')];
        await show({ ...team, lines }, customs);

        // Then: one sound
        expect(selectedTab()).toEqual('private-conversation-customs');
        expect(component.unread()).toEqual(3);
        expect(component.unreadReceived()).toEqual(3);
        expect(play).toHaveBeenCalledTimes(2);

        // When: the team shown
        await click(tab('team'));

        // Then
        expect(component.unread()).toEqual(0);
        expect(query('#private-conversation-team .badge')).toBeNull();

        // When: received in the team shown
        await show({ ...team, lines: [...lines, privateMessage('bob', 'seen')] }, customs);

        // Then
        expect(component.unread()).toEqual(0);
        expect(component.unreadReceived()).toEqual(3);
        expect(play).toHaveBeenCalledTimes(2);

        // When: the page hidden
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await show({ ...team, lines: [...lines, privateMessage('bob', 'hidden')] }, customs);

        // Then
        expect(component.unread()).toEqual(0);
        expect(play).toHaveBeenCalledTimes(3);
    });

    test('should send a failed message again, unless the composer waits for other than its messages unsent', async () => {
        // Given
        const failed: PrivateLine = privateMessage('alice', 'lost', { state: ChatMessageState.FAILED });
        await show(privateConversation('team', ['alice', 'bob'], [failed]));
        const retry = (): HTMLButtonElement => [...fixture.nativeElement.querySelectorAll('#private-log button')]
            .find((button: HTMLButtonElement) => button.textContent.includes('Retry')) as HTMLButtonElement;

        // When
        await click(retry());

        // Then
        expect(fake.retry).toHaveBeenCalledExactlyOnceWith('team', failed.kind === PrivateLineKind.MESSAGE && failed.message.messageId);

        // When
        fake.wait.set(PrivateComposerWait.UNSENT);
        await fixture.whenStable();

        // Then
        expect(retry().disabled).toEqual(false);

        // When
        fake.wait.set(PrivateComposerWait.KEYS);
        await fixture.whenStable();

        // Then
        expect(retry().disabled).toEqual(true);
    });
});

describe('PrivateConversationsComponent recompiled from its metadata', () => {
    test('should resolve the query of its log', async () => {
        // Given
        TestBed.configureTestingModule({ imports: [PrivateConversationsComponent] });
        TestBed.overrideComponent(PrivateConversationsComponent, { add: { host: { class: 'recompiled' } } });
        const fixture: ComponentFixture<PrivateConversationsComponent> = TestBed.createComponent(PrivateConversationsComponent);

        // When
        fixture.componentRef.setInput('conversations', new PrivateConversationsMock().conversations);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.classList).toContain('recompiled');
        expect(fixture.componentInstance['log']().nativeElement.id).toEqual('private-log');
    });
});

describe('PrivateConversationsComponent between two pages', { timeout: 30_000 }, () => {
    test('should send a message encrypted to the other members', async () => {
        // Given
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        const hub: RoomHub<PrivatePayloads> = new RoomHub<PrivatePayloads>();
        const factory: IDBFactory = new IDBFactory();
        const alice = new PrivateConversations(hub.room('alice'), { keyStore: new ParticipantKeyStore(factory) });
        const bob = new PrivateConversations(hub.room('bob'), { keyStore: new ParticipantKeyStore(factory) });
        const team = { id: 'team', members: ['alice', 'bob'], title: { key: 'test.team' }, open: true };
        TestBed.configureTestingModule({ imports: [HostComponent] });
        TestBed.inject(TranslocoService).setTranslationKey('test.team', 'Team');
        const fixture: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
        fixture.componentInstance.conversations.set(alice);
        alice.declare([team]);
        bob.declare([team]);
        await vi.waitFor(() => expect(alice.composerWait('team', Date.now())).toBeUndefined());
        await fixture.whenStable();

        // When
        const textArea: HTMLTextAreaElement = textAreaFieldInput(fixture.nativeElement, 'Message to bob');
        textArea.value = 'I put 7';
        textArea.dispatchEvent(new Event('input'));
        await fixture.whenStable();
        (fixture.nativeElement.querySelector('#private-send') as HTMLButtonElement).click();
        await fixture.whenStable();

        // Then
        await vi.waitFor(() => expect(bob.shown()[0].lines.map((line: Readonly<PrivateLine>) => line.kind === PrivateLineKind.MESSAGE && line.message.text))
            .toEqual(['I put 7']));
        await vi.waitFor(async () => {
            await fixture.whenStable();
            expect(fixture.nativeElement.querySelector('#private-log .chat-bubble')?.textContent).toEqual('alice: I put 7');
            expect(fixture.nativeElement.querySelector('#private-log').textContent).not.toContain('Sending');
        });
        alice.destroy();
        bob.destroy();
    });
});
