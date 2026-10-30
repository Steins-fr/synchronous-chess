import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { describe, expect, test } from 'vitest';
import { RoomHub } from './room-hub';

describe('RoomHub', () => {
    test('should deliver a message sent while delivering another one after it, as the chain orders them', () => {
        // Given
        const hub = new RoomHub<{ ping: number; pong: number }>();
        const room = hub.room('a');
        const received: string[] = [];
        room.messenger('ping').subscribe((message: AppMessage) => {
            received.push(message.type);
            room.transmitMessage('pong', 1);
        });
        room.messenger('pong').subscribe((message: AppMessage) => received.push(message.type));
        hub.room('b').messenger('pong').subscribe(() => received.push('pong of b'));

        // When
        room.transmitMessage('ping', 0);

        // Then
        expect(received).toEqual(['ping', 'pong', 'pong of b']);
        expect(hub.types()).toEqual(['ping', 'pong']);
    });

    test('should order the messages without sequencer by default, at the chain time 0', () => {
        // Given
        const hub = new RoomHub<{ ping: number }>();
        const room = hub.room('a');
        const received: AppMessage[] = [];
        room.messenger('ping').subscribe((message: AppMessage) => received.push(message));

        // When
        room.transmitMessage('ping', 0);

        // Then
        expect(room.sequencer()).toBeUndefined();
        expect(room.sequencedBy(received[0])).toBeUndefined();
        expect(room.sequencedAt(received[0])).toEqual(0);
    });

    test('should stamp each message with the sequencer and the chain time it was ordered at, kept once replayed', () => {
        // Given
        const hub = new RoomHub<{ ping: number }>();
        const a = hub.room('a');
        const b = hub.room('b');
        const received: AppMessage[] = [];
        a.messenger('ping').subscribe((message: AppMessage) => received.push(message));

        // When
        hub.sequencer.set('a');
        hub.time = 1000;
        a.transmitMessage('ping', 1);
        hub.sequencer.set('b');
        hub.time = 2000;
        b.transmitMessage('ping', 2);

        // Then
        expect(a.sequencer()).toEqual('b');
        expect(received.map((message: AppMessage) => [a.sequencedBy(message), a.sequencedAt(message)])).toEqual([['a', 1000], ['b', 2000]]);
        expect(a.sequencedBy({ ...received[0] })).toBeUndefined();
        expect(a.sequencedAt({ ...received[0] })).toBeUndefined();

        // When a participant reloads the page
        const reloaded = hub.room('c');
        const replayed: AppMessage[] = [];
        reloaded.messenger('ping').subscribe((message: AppMessage) => replayed.push(message));
        hub.time = 3000;
        hub.replay(reloaded);

        // Then
        expect(replayed).toEqual(received);
        expect(replayed.map((message: AppMessage) => [reloaded.sequencedBy(message), reloaded.sequencedAt(message)])).toEqual([['a', 1000], ['b', 2000]]);
    });
});
