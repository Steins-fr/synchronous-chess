import { expect, Locator } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { SLOW, test } from './test-room';

/** The connections of a room: the participants leaving, reloading their page, or losing their connections */
test.describe('Room', () => {
    // Reconnections wait for the departures, the joins refused for 20 seconds and the socket replacements
    const RECONNECTION_TIMEOUT: number = 60_000;

    test('connects the players joining the room to each other', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await carol.sendMessage('hello');

        // Then
        await alice.expectMessage('carol', 'hello');
        await bob.expectMessage('carol', 'hello');
    });

    test('shows the connections of a player in the debug panel of WebRTC, closed by Escape or its button', async ({ room }) => {
        // Given: the local environment offers the debug panel
        const [alice]: RoomParticipant[] = await room.connect('alice', 'bob');
        const button: Locator = alice.page.getByRole('button', { name: 'WebRTC debug' });
        const sheet: Locator = alice.page.getByRole('dialog', { name: 'WebRTC debug' });

        // When
        await button.click();

        // Then
        await expect(sheet).toContainText('Connection to the player: bob');

        // When
        await alice.page.keyboard.press('Escape');

        // Then: the focus back on its button
        await expect(sheet).toBeHidden();
        await expect(button).toBeFocused();

        // When
        await button.click();
        await sheet.getByRole('button', { name: 'Close the WebRTC debug' }).click();

        // Then
        await expect(sheet).toBeHidden();
    });

    test('lets the host reloading its page join its room again, taken over by another participant', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await alice.reload();

        // Then
        for (const participant of [alice, bob, carol]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await participant.expectParticipants(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT);
        }
        await alice.sendMessage('back');
        await bob.expectMessage('alice', 'back');
        await carol.expectMessage('alice', 'back');
    });

    test('lets a player join the room its host takes back once all the participants left', SLOW, async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When the participants leave together
        await Promise.all([bob.close(), carol.close()]);
        await alice.expectParticipants(['alice']);
        // The host lets the room go for the participants it lost, then takes it back: joins are refused for 20 seconds
        await alice.page.waitForTimeout(25_000);
        const dave: RoomParticipant = await room.join('dave');

        // Then
        await alice.expectParticipants(['alice', 'dave']);
        await dave.expectParticipants(['alice', 'dave']);
    });

    test('lets the others take the room over from a host which lost its connections, then the host join it', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await alice.cutConnections();

        // Then
        await alice.expectParticipants(['alice']);
        for (const participant of [alice, bob, carol]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await participant.expectParticipants(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT);
        }
        await alice.sendMessage('back');
        await bob.expectMessage('alice', 'back');
    });

    test('lets a player which lost its connections join the room again', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await carol.cutConnections();

        // Then
        await carol.expectParticipants(['carol']);
        for (const participant of [alice, bob, carol]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await participant.expectParticipants(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT);
        }
    });

    test('restores the connection between two participants through another one', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When bob loses its connection to carol, the second one it opened, after the one to the host
        await bob.cutConnections(1);

        // Then
        await bob.expectParticipants(['alice', 'bob']);
        await bob.expectParticipants(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT);
        await carol.expectParticipants(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT);
        await alice.expectParticipants(['alice', 'bob', 'carol']);
    });
});
