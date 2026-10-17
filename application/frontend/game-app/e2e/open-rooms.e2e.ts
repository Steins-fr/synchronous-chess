import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

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
        await bob.expectNotification('Le mot de passe de la salle est incorrect.');
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
        await expect(carol.page.getByText(`Aucune salle ne contient « ${ room.name }-missing ».`)).toBeVisible();
        // The list, searched or not, opened no socket: the socket serves the connectivity of a room only
        carol.expectNoApiSocket();
    });
});
