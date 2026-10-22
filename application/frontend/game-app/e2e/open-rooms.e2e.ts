import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test, TestRoom } from './test-room';

/** The list of the open rooms, listed by the HTTP API: joining a room from it, public or private */
test.describe('Open rooms', () => {
    test('lists a public room, joined from the list', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice');
        await alice.expectParticipants(['alice']);

        // When
        const bob: RoomParticipant = await room.join('bob');

        // Then
        await bob.expectConnected(['alice', 'bob']);
        await alice.expectConnected(['alice', 'bob']);
        await bob.expectApiSocket();
    });

    test('lists a private room, joined with its password only', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice', 'secret');
        await alice.expectParticipants(['alice']);

        // When
        const bob: RoomParticipant = await room.join('bob', 'wrong-password');

        // Then
        await bob.expectNotification('The password of the room is wrong.');
        await bob.expectSetupForm();
        await bob.expectOpenRoom(room.name, true);

        // When
        await bob.joinListedRoom(room.name, 'secret');

        // Then
        await bob.expectConnected(['alice', 'bob']);
        await alice.expectConnected(['alice', 'bob']);
    });

    test('searches the rooms by a part of their name, whatever the case', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice');
        await alice.expectParticipants(['alice']);
        const carol: RoomParticipant = await room.visit('carol');

        // When
        await carol.searchRooms(room.name.toUpperCase());

        // Then
        await carol.expectListedRooms([room.name]);

        // When
        await carol.searchRooms(`${ room.name }-missing`);

        // Then
        await expect(carol.page.getByText(`No room contains “${ room.name }-missing”.`)).toBeVisible();
        // The list, searched or not, opened no socket: the socket serves the connectivity of a room only
        carol.expectNoApiSocket();
    });

    test('lists a room on the page of its game only', async ({ browser, room }) => {
        // Given a room of the poker
        const poker = new TestRoom(browser, '/seventeen-poker', `${ room.name }-poker`);

        try {
            const alice: RoomParticipant = await poker.create('alice');
            await alice.expectParticipants(['alice']);

            // When
            const bob: RoomParticipant = await poker.join('bob');
            const carol: RoomParticipant = await room.visit('carol');
            await carol.searchRooms(poker.name);

            // Then
            await bob.expectConnected(['alice', 'bob']);
            await expect(carol.page.getByText(`No room contains “${ poker.name }”.`)).toBeVisible();
        } finally {
            await poker.close();
        }
    });
});
