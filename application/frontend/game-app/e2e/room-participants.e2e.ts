import { RoomParticipant } from './room-participant';
import { test } from './test-room';

/**
 * The participants joining and leaving a room: refused joins, players joining together, departures for good and the
 * rooms of two participants
 */
test.describe('Room participants', () => {
    // Reconnections wait for the departures, the joins refused for 20 seconds and the socket replacements
    const RECONNECTION_TIMEOUT: number = 60_000;
    // The players joining under a name in the room are refused for 20 seconds, as a player reloading its page
    const REFUSED_JOIN_TIMEOUT: number = 40_000;
    // Shorter than the 15 seconds a negotiation takes to time out
    const NEGOTIATION_TIMEOUT: number = 10_000;

    test('refuses the creation of a room which exists already', async ({ room }) => {
        // Given
        const [alice]: RoomParticipant[] = await room.connect('alice');

        // When
        const bob: RoomParticipant = await room.create('bob');

        // Then
        await bob.expectNotification('La salle existe déjà.');
        await bob.expectSetupForm();
        await alice.expectParticipants(['alice']);
    });

    test('tells a player the host of the room it joins left', async ({ room }) => {
        // Given
        const [alice]: RoomParticipant[] = await room.connect('alice');
        const bob: RoomParticipant = await room.visit('bob');
        await alice.close();
        await bob.expectRoomState(room.name, 'Hôte en reconnexion');

        // When
        await bob.joinListedRoom(room.name);

        // Then
        await bob.expectNotification('L\'hôte de la salle s\'est déconnecté.', REFUSED_JOIN_TIMEOUT);
        await bob.expectSetupForm();
    });

    test('connects the players joining the room at the same time', async ({ room }) => {
        // Given
        const [alice]: RoomParticipant[] = await room.connect('alice');

        // When
        const players: RoomParticipant[] = await Promise.all(['bob', 'carol', 'dave'].map((name: string) => room.join(name)));

        // Then
        const everyone: RoomParticipant[] = [alice, ...players];
        await Promise.all(everyone.map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol', 'dave'], RECONNECTION_TIMEOUT)));
        await players[2].sendMessage('hello');
        await Promise.all(everyone.map((participant: RoomParticipant) => participant.expectMessage('dave', 'hello')));
    });

    test('refuses a player joining under the name of a participant, the participant staying in the room', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        const impostor: RoomParticipant = await room.join('bob');

        // Then
        await impostor.expectNotification('Un joueur de ce nom est déjà dans la salle.', REFUSED_JOIN_TIMEOUT);
        await impostor.expectSetupForm();
        await Promise.all([alice, bob, carol].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol'])));
        await alice.sendMessage('still there?');
        await bob.expectMessage('alice', 'still there?');
    });

    test('tells a player the room is full, the participants not waiting for it', async ({ room }) => {
        test.setTimeout(180_000);
        // Given the chat room accepts 6 players
        const participants: RoomParticipant[] = await room.connect('alice', 'bob', 'carol', 'dave', 'eve', 'frank');
        const grace: RoomParticipant = await room.visit('grace');
        await grace.expectRoomState(room.name, 'Pleine');

        // When
        await grace.joinListedRoom(room.name);

        // Then
        await grace.expectNotification('La salle est pleine.');
        await grace.expectSetupForm();
        const names: string[] = participants.map((participant: RoomParticipant) => participant.name);
        await Promise.all(participants.map((participant: RoomParticipant) => participant.expectConnected(names)));
    });

    test('lets a player join the room once a participant of the full room left', async ({ room }) => {
        test.setTimeout(180_000);
        // Given
        const [alice, bob, carol, dave, eve, frank]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol', 'dave', 'eve', 'frank');
        const remaining: RoomParticipant[] = [alice, bob, carol, dave, eve];

        // When
        await frank.close();
        await Promise.all(remaining.map((participant: RoomParticipant) => participant.expectParticipants(['alice', 'bob', 'carol', 'dave', 'eve'])));
        const grace: RoomParticipant = await room.join('grace');

        // Then
        const names: string[] = ['alice', 'bob', 'carol', 'dave', 'eve', 'grace'];
        await Promise.all([...remaining, grace].map((participant: RoomParticipant) => participant.expectConnected(names, RECONNECTION_TIMEOUT)));
    });

    test('lets a player which left the room join it again under the same name', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await bob.close();
        await Promise.all([alice, carol].map((participant: RoomParticipant) => participant.expectParticipants(['alice', 'carol'])));
        const bobAgain: RoomParticipant = await room.join('bob');

        // Then
        await Promise.all([alice, bobAgain, carol].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT)));
        await bobAgain.sendMessage('back');
        await alice.expectMessage('bob', 'back');
        await carol.expectMessage('bob', 'back');
    });

    test('forgets a player leaving while it connects to the host', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When carol leaves while the host negotiates with it
        const carol: RoomParticipant = await room.join('carol');
        await alice.expectParticipants(['alice', 'bob', 'carol']);
        await carol.close();

        // Then before the negotiation times out, after 15 seconds: the API tells the host the player left
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], NEGOTIATION_TIMEOUT)));
        const carolAgain: RoomParticipant = await room.join('carol');
        await Promise.all([alice, bob, carolAgain].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT)));
    });

    test('lets a player join the room taken over from a host which left for good', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await alice.close();
        await Promise.all([bob, carol].map((participant: RoomParticipant) => participant.expectParticipants(['bob', 'carol'])));
        const dave: RoomParticipant = await room.join('dave');

        // Then
        await Promise.all([bob, carol, dave].map((participant: RoomParticipant) => participant.expectConnected(['bob', 'carol', 'dave'], RECONNECTION_TIMEOUT)));
        await dave.sendMessage('hello');
        await bob.expectMessage('dave', 'hello');
        await carol.expectMessage('dave', 'hello');
    });

    test('hands the room over twice, to the participants left, then lets a player join it', async ({ room }) => {
        test.setTimeout(180_000);
        // Given
        const [alice, bob, carol, dave]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol', 'dave');

        // When the host leaves, then the participant which took the room over
        await alice.close();
        await Promise.all([bob, carol, dave].map((participant: RoomParticipant) => participant.expectParticipants(['bob', 'carol', 'dave'])));
        await bob.close();
        await Promise.all([carol, dave].map((participant: RoomParticipant) => participant.expectParticipants(['carol', 'dave'])));
        const eve: RoomParticipant = await room.join('eve');

        // Then
        await Promise.all([carol, dave, eve].map((participant: RoomParticipant) => participant.expectConnected(['carol', 'dave', 'eve'], RECONNECTION_TIMEOUT)));
        await eve.sendMessage('hello');
        await carol.expectMessage('eve', 'hello');
        await dave.expectMessage('eve', 'hello');
    });

    test('lets the last participant take over the room its host left, then a player join it', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        await alice.close();
        await bob.expectParticipants(['bob']);
        // The last participant joins the room again for 20 seconds, the host may only reload its page, then takes it over
        await bob.page.waitForTimeout(25_000);
        const carol: RoomParticipant = await room.join('carol');

        // Then
        await Promise.all([bob, carol].map((participant: RoomParticipant) => participant.expectConnected(['bob', 'carol'], RECONNECTION_TIMEOUT)));
    });

    test('connects the two participants of a room again once the player lost its connection', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        await bob.cutConnections();

        // Then
        await Promise.all([alice.expectParticipants(['alice']), bob.expectParticipants(['bob'])]);
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
        await bob.sendMessage('back');
        await alice.expectMessage('bob', 'back');
    });

    test('connects the two participants of a room again once the host lost its connection', async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        await alice.cutConnections();

        // Then
        await Promise.all([alice.expectParticipants(['alice']), bob.expectParticipants(['bob'])]);
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
        await alice.sendMessage('back');
        await bob.expectMessage('alice', 'back');
    });

    test('lets a player which lost its connection to the host while joining the room join it again', async ({ room }) => {
        // Given
        const [alice]: RoomParticipant[] = await room.connect('alice');
        const bob: RoomParticipant = await room.join('bob');

        // When the connection to the host is lost while the player negotiates it
        await bob.page.waitForFunction(() => window.peerConnections.length > 0);
        await bob.cutConnections();

        // Then
        await bob.expectNotification('La connexion à l\'hôte de la salle a échoué, nouvelle tentative…', RECONNECTION_TIMEOUT);
        await Promise.all([alice, bob].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob'], RECONNECTION_TIMEOUT)));
    });

    test('lets two players reloading their page at the same time join the room again', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        await Promise.all([bob.reloadAndJoin(room.name), carol.reloadAndJoin(room.name)]);

        // Then
        await Promise.all([alice, bob, carol].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT)));
        await carol.sendMessage('back');
        await alice.expectMessage('carol', 'back');
        await bob.expectMessage('carol', 'back');
    });

    test('lets a player reloading its page twice in a row join the room again', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When the player reloads its page while it joins the room again
        await bob.reloadAndJoin(room.name);
        await bob.reloadAndJoin(room.name);

        // Then
        await Promise.all([alice, bob, carol].map((participant: RoomParticipant) => participant.expectConnected(['alice', 'bob', 'carol'], RECONNECTION_TIMEOUT)));
        await bob.sendMessage('back');
        await alice.expectMessage('bob', 'back');
        await carol.expectMessage('bob', 'back');
    });

    test('lets a player join the room while a participant reloads its page', async ({ room }) => {
        // Given
        const [alice, bob, carol]: RoomParticipant[] = await room.connect('alice', 'bob', 'carol');

        // When
        const [, dave]: [void, RoomParticipant] = await Promise.all([carol.reloadAndJoin(room.name), room.join('dave')]);

        // Then
        const names: string[] = ['alice', 'bob', 'carol', 'dave'];
        await Promise.all([alice, bob, carol, dave].map((participant: RoomParticipant) => participant.expectConnected(names, RECONNECTION_TIMEOUT)));
    });
});
