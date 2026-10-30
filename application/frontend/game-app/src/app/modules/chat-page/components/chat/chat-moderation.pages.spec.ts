import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogService } from '@app/services/dialog/dialog.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ChatComponent, ChatMessengerType, ChatPayloads } from './chat.component';
import { ChatModerationAction, MuteMinutes } from './chat-moderation';

/** The pages of the participants of a room, each one with its chat, on one chain */
describe('ChatComponent moderated on every page', () => {
    const SECOND: number = 1000;
    let hub: RoomHub<ChatPayloads>;
    let pages: Map<string, { room: Room<ChatPayloads>; fixture: ComponentFixture<ChatComponent> }>;

    async function open(name: string, replayed: boolean = false): Promise<Room<ChatPayloads>> {
        const room: Room<ChatPayloads> = hub.room(name);
        const fixture: ComponentFixture<ChatComponent> = TestBed.createComponent(ChatComponent);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
        pages.set(name, { room, fixture });
        if (replayed) {
            hub.replay(room);
        }
        return room;
    }

    function page(name: string): { room: Room<ChatPayloads>; fixture: ComponentFixture<ChatComponent> } {
        return pages.get(name) as { room: Room<ChatPayloads>; fixture: ComponentFixture<ChatComponent> };
    }

    /** The lines of the log of a page: its messages, with their author, and its notices */
    async function logLines(name: string): Promise<string[]> {
        const { fixture } = page(name);
        await fixture.whenStable();
        return [...fixture.nativeElement.querySelectorAll('#chat-log .chat-bubble, #chat-log .chat-notice')].map((line: Element) => line.textContent.trim());
    }

    /** A message sent around the composer, as a script in the page would */
    function send(name: string, text: string): void {
        page(name).room.transmitMessage(ChatMessengerType.CHAT_MESSAGE, { id: crypto.randomUUID(), text, at: hub.time });
    }

    /** The time passing, the sequencer ordering the next messages at the time of the pages */
    function wait(seconds: number): void {
        vi.advanceTimersByTime(seconds * SECOND);
        hub.time = Date.now();
    }

    /** The moderator picks an item of the menu of a participant */
    async function moderate(moderator: string, target: string, item: string): Promise<void> {
        const { fixture } = page(moderator);
        (fixture.nativeElement.querySelector(`button[aria-label="Moderate ${ target }"]`) as HTMLButtonElement).click();
        await fixture.whenStable();
        ([...document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-panel button[role="menuitem"]')]
            .find((button: HTMLButtonElement) => button.textContent.trim() === item) as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    beforeEach(async () => {
        // The end of a mute runs on an interval of RxJS
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
        await TestBed.configureTestingModule({ imports: [ChatComponent] }).compileComponents();
        hub = new RoomHub<ChatPayloads>();
        hub.sequencer.set('alice');
        hub.time = Date.now();
        pages = new Map();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should mute, unmute and remove a participant alike on every page, the ones replaying the chain included', async () => {
        // Given: erin only watches
        for (const name of ['alice', 'bob', 'carol', 'erin']) {
            await open(name);
        }
        vi.spyOn(TestBed.inject(DialogService), 'confirm').mockResolvedValue(true);
        send('bob', 'before');

        // When: alice mutes bob, which sends anyway
        await moderate('alice', 'bob', 'Mute for 5 minutes');
        wait(60);
        Array.from({ length: 10 }, () => send('bob', 'muted'));

        // Then: hidden on every page, its flood not told
        const muted: string[] = ['bob: before', 'alice muted bob for 5 minutes'];
        expect(await logLines('alice')).toEqual(['bob: before', 'You muted bob for 5 minutes']);
        expect(await logLines('bob')).toEqual(['bob: before', 'alice muted you for 5 minutes']);
        expect(await logLines('carol')).toEqual(muted);
        expect(await logLines('erin')).toEqual(muted);

        // When: its mute ended, then muted again until unmuted
        wait(241);
        send('bob', 'after');
        await moderate('alice', 'bob', 'Mute until the end of the room');
        send('bob', 'hidden');
        await moderate('alice', 'bob', 'Unmute');
        send('bob', 'back');

        // Then
        const unmuted: string[] = [...muted, 'bob: after', 'alice muted bob until the end of the room', 'alice unmuted bob', 'bob: back'];
        expect(await logLines('carol')).toEqual(unmuted);
        expect(await logLines('erin')).toEqual(unmuted);

        // When: bob decides, not ordering the chain, twice
        page('bob').room.transmitMessage(ChatMessengerType.MODERATION, { action: ChatModerationAction.MUTE, target: 'carol', minutes: MuteMinutes.SHORT });
        page('bob').room.transmitMessage(ChatMessengerType.MODERATION, { action: ChatModerationAction.REMOVE, target: 'carol' });

        // Then: dropped by every page, without report: a pending decision of an honest moderator comes back ordered by another sequencer
        expect(hub.reported()).toEqual([]);
        expect(await logLines('erin')).toEqual(unmuted);

        // When: alice removes carol, whose page gives the room up
        await moderate('alice', 'carol', 'Remove from the room');
        hub.leave(page('carol').room);

        // Then: excluded by every page, its departure not told
        expect(hub.excluded).toEqual([['alice', 'carol'], ['bob', 'carol'], ['carol', 'carol'], ['erin', 'carol']]);
        const removed: string[] = [...unmuted, 'alice removed carol from the room'];
        expect(await logLines('erin')).toEqual(removed);
        expect(await logLines('bob')).toEqual(removed.map((line: string) => line.replace('alice muted bob', 'alice muted you').replace('alice unmuted bob', 'alice unmuted you')));

        // When: alice leaves, bob ordering the chain in its place, which mutes erin, then dave not there yet
        hub.leave(page('alice').room);
        hub.sequencer.set('bob');
        wait(99);
        await moderate('bob', 'erin', 'Mute for 30 minutes');
        page('bob').room.transmitMessage(ChatMessengerType.MODERATION, { action: ChatModerationAction.MUTE, target: 'dave', minutes: null });

        // Then
        const handedOver: string[] = [...removed, 'alice left the room', 'bob muted you for 30 minutes', 'bob muted dave until the end of the room'];
        expect(await logLines('erin')).toEqual(handedOver);

        // When: dave joins late, its page replaying the chain
        await open('dave', true);

        // Then: the decisions of alice kept, ordered by it, the departures not on the chain
        expect(await logLines('dave')).toEqual([...removed, 'bob muted erin for 30 minutes', 'bob muted you until the end of the room']);
        expect(page('dave').fixture.nativeElement.querySelector('mat-hint')?.textContent).toEqual('You are muted until the end of the room');
        expect(hub.reported()).toEqual([]);
    });
});
