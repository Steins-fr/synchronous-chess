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
});
