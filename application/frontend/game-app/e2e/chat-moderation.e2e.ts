import { expect, Locator } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

/**
 * The offensive words of the chat, masked on every page by default: an option of each reader. The host moderates the
 * chat: it mutes a participant, every page hiding its messages, or removes it from the room
 */
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

    test('mutes then removes a participant, refused joining again under its name or another one', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When: the host mutes bob
        await alice.moderate('bob', 'Mute for 5 minutes');

        // Then: told on every page, worded for each one, the composer of bob waiting
        await expect(alice.chatNotices('You muted bob for 5 minutes')).toHaveCount(1);
        await expect(bob.chatNotices('alice muted you for 5 minutes')).toHaveCount(1);
        await expect(carol.chatNotices('alice muted bob for 5 minutes')).toHaveCount(1);
        await bob.page.getByRole('textbox', { name: 'Type your message' }).fill('hello?');
        await expect(bob.page.getByRole('button', { name: 'Send' })).toBeDisabled();
        await expect(bob.page.getByRole('textbox', { name: 'Type your message' })).toHaveAccessibleDescription(/^You are muted until /);

        // When: bob sends around his composer, then carol sends
        await bob.transmitAroundComposer(['muted message']);
        await carol.sendMessage('anyone?');

        // Then: his message hidden on every page
        for (const participant of [alice, bob, carol]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await expect(participant.chatBubbles()).toHaveText(['carol: anyone?']);
        }

        // When: a page reloaded
        await carol.reload();

        // Then: the history hidden alike, the mute told
        await carol.expectConnected(['alice', 'bob', 'carol']);
        await expect(carol.chatNotices('alice muted bob for 5 minutes')).toHaveCount(1);
        await expect(carol.chatBubbles()).toHaveText(['carol: anyone?']);

        // When: the host unmutes bob
        await alice.moderate('bob', 'Unmute');

        // Then: his next message shows
        await expect(bob.chatNotices('alice unmuted you')).toHaveCount(1);
        await bob.sendMessage('thanks');
        await expect(carol.chatBubbles()).toHaveText(['carol: anyone?', 'bob: thanks']);

        // When: the host removes bob, once confirmed
        await alice.moderate('bob', 'Remove from the room');
        const dialog: Locator = alice.page.locator('.dialog-overlay');
        await expect(dialog).toContainText('Remove from the room?');
        await dialog.getByRole('button', { name: 'Confirm' }).click();

        // Then: bob leaves the room, the others told, their links to him closed after a few seconds
        await bob.expectNotification('The host removed you from the room.');
        await bob.expectSetupForm();
        await expect(alice.chatNotices('You removed bob from the room')).toHaveCount(1);
        await expect(carol.chatNotices('alice removed bob from the room')).toHaveCount(1);
        await alice.expectConnected(['alice', 'carol']);
        await carol.expectConnected(['alice', 'carol']);

        // When / Then: bob joins again, under his name, then under another one from the same browser: both refused
        const refusal: string = 'You were removed from this room: you cannot join it again.';
        await bob.join(room.id);
        await bob.expectNotification(refusal);
        const bobby: RoomParticipant = await bob.newTab('bobby');
        await bobby.join(room.id);
        await bobby.expectNotification(refusal);
        await carol.expectConnected(['alice', 'carol']);
    });
});
