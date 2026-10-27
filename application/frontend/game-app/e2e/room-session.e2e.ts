import { RoomParticipant } from './room-participant';
import { SLOW, test, TestRoom } from './test-room';

/** The room of a page in its URL, and the session of its tab: a reload resumes the room, a link opens its join dialog */
test.describe('Room session', () => {
    // Reconnections wait for the departures, the joins refused for 20 seconds and the socket replacements
    const RECONNECTION_TIMEOUT: number = 60_000;

    test('resumes a private room once reloaded, under the name of the player and without its password', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice', 'secret');
        await alice.expectParticipants(['alice']);
        const bob: RoomParticipant = await room.join('bob', 'secret');
        await bob.expectConnected(['alice', 'bob']);
        await bob.roomUrl(room.id);

        // When
        await bob.reload();

        // Then: no dialog, no prompt out of a match
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
        bob.expectUnloadPrompts(0);
        await bob.sendMessage('back');
        await alice.expectMessage('bob', 'back');
    });

    test('leaves its room from its bar, the list shown once reloaded', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');
        await bob.roomUrl(room.id);

        // When
        await bob.leaveRoom();

        // Then: no prompt out of a match
        await alice.expectParticipants(['alice']);
        await bob.expectSetupForm();
        await bob.expectNoRoomUrl();
        await bob.reload();
        await bob.expectSetupForm();
        await bob.expectNoRoomUrl();
        bob.expectUnloadPrompts(0);
    });

    test('hands the room over once its host left it from its bar', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await alice.leaveRoom();

        // Then
        await alice.expectSetupForm();
        await Promise.all([bob, carol].map((participant: RoomParticipant) => participant.expectConnected(['bob', 'carol'], RECONNECTION_TIMEOUT)));
        await carol.sendMessage('still here');
        await bob.expectMessage('carol', 'still here');
        const dave: RoomParticipant = await room.join('dave');
        await Promise.all([bob, carol, dave].map((participant: RoomParticipant) => participant.expectConnected(['bob', 'carol', 'dave'], RECONNECTION_TIMEOUT)));
    });

    test('lets the host alone in its room reconnect it once reloaded', SLOW, async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice');
        await alice.expectParticipants(['alice']);
        await alice.roomUrl(room.id);

        // When: the room waits for its host, the join refused for 20 seconds
        await alice.reload();
        await alice.expectParticipants(['alice'], RECONNECTION_TIMEOUT);
        const bob: RoomParticipant = await room.join('bob');

        // Then
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
    });

    test('opens the join dialog of the room of a link, in another browser', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice', 'secret');
        await alice.expectParticipants(['alice']);
        const url: string = await alice.roomUrl(room.id);

        // When
        const bob: RoomParticipant = await room.visitUrl('bob', url);

        // Then
        await bob.expectJoinDialog(room.id, '');
        await bob.sendJoinDialog('secret');
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'])));
        await bob.roomUrl(room.id);
    });

    test('tells the room of a link ended or unknown, the list shown', async ({ room }) => {
        // When
        const bob: RoomParticipant = await room.visitUrl('bob', '/simple-chat?room=unknown%23000000');

        // Then
        await bob.expectNotification('This room has ended or does not exist.');
        await bob.expectSetupForm();
        await bob.expectNoRoomUrl();
    });

    test('asks another name to a duplicated tab', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');
        await bob.roomUrl(room.id);

        // When: the copy of the session of the tab names a player its first tab holds in the room
        const copy: RoomParticipant = await bob.duplicateTab('bobby');

        // Then
        await copy.expectJoinDialog(room.id, '');
        await copy.sendJoinDialog();
        await Promise.all([alice, bob, copy].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'bobby'])));
    });

    test('plays two rooms in two tabs, each one reloaded without leaving the other', async ({ browser, room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');
        const other: TestRoom = new TestRoom(browser, '/simple-chat', `${ room.name }-other`);
        try {
            const carol: RoomParticipant = await other.create('carol');
            await carol.expectParticipants(['carol']);
            const aliceTab: RoomParticipant = await alice.newTab('alice');
            await aliceTab.join(other.id);
            await Promise.all([carol, aliceTab].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'carol'])));

            // When
            await alice.reload();
            await aliceTab.reload();

            // Then
            await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
            await Promise.all([carol, aliceTab].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'carol'], RECONNECTION_TIMEOUT)));
            await alice.roomUrl(room.id);
            await aliceTab.roomUrl(other.id);
        } finally {
            await other.close();
        }
    });
});
