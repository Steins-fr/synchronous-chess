import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

/** The offensive words of the chat, masked on every page by default: an option of each reader */
test.describe('Moderation of the chat', () => {
    // Offensive words of two lists, the English and the French ones
    const written: string = 'alice: what the fuck, merde!';
    const masked: string = 'alice: what the f***, m****!';

    test('masks the offensive words of every message, as written for a reader turning the option off', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        await alice.sendMessage('what the fuck, merde!');

        // Then: masked on every page, the one of its author included
        await expect(bob.chatBubbles()).toHaveText([masked]);
        await expect(alice.chatBubbles()).toHaveText([masked]);

        // When: a reader turns the option off
        await bob.page.locator('#chat-options').click();
        await bob.page.getByRole('menuitemcheckbox', { name: 'Hide offensive words' }).click();

        // Then: as written for that reader only
        await expect(bob.chatBubbles()).toHaveText([written]);
        await expect(alice.chatBubbles()).toHaveText([masked]);

        // When: a participant joining late
        const carol: RoomParticipant = await room.join('carol');
        await carol.expectConnected(['alice', 'bob', 'carol']);

        // Then: the history masked, the lists loaded with the chat
        await expect(carol.chatBubbles()).toHaveText([masked]);
    });
});
