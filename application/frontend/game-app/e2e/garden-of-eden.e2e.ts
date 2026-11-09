import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of the Garden of Eden of its own for a test */
const test = roomTest.extend<{ gardenOfEden: TestRoom }>({
    gardenOfEden: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/garden-of-eden');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-eden-table');
const status = (participant: RoomParticipant): Locator => table(participant).getByRole('status');

/** What stays in place on the page of the Garden of Eden while the game is played: the status, the count, the actions */
const STEADY: ReadonlyArray<string> = ['app-eden-table output', '#apples', '#actions'];

type Apple = 'Gold' | 'Silver' | 'Red';

/** The players sit on the first seats, in their order, the spectator watches */
async function seated(room: TestRoom, players: ReadonlyArray<string>, spectator: string): Promise<RoomParticipant[]> {
    const participants: RoomParticipant[] = await room.connect(players[0], ...players.slice(1), spectator);
    const watching: RoomParticipant = participants.at(-1) as RoomParticipant;
    for (const [seat, player] of participants.slice(0, players.length).entries()) {
        // eslint-disable-next-line no-await-in-loop -- the seats one after the other
        await table(player).locator(`#seat-${ seat }`).getByRole('button', { name: 'Sit here' }).click();
        // eslint-disable-next-line no-await-in-loop -- seated before the next one sits
        await expect(table(watching).locator(`#seat-${ seat }`)).toContainText(player.name);
    }
    return participants;
}

/** The first player starts the game with the options picked: the players draw the seed, then the first vote opens */
async function started(room: TestRoom, players: ReadonlyArray<string>, spectator: string, picks: ReadonlyArray<string> = []): Promise<RoomParticipant[]> {
    const participants: RoomParticipant[] = await seated(room, players, spectator);
    for (const pick of picks) {
        // eslint-disable-next-line no-await-in-loop -- each pick shows before the next one
        await table(participants[0]).getByRole('radio', { name: pick, exact: true }).click();
    }
    await table(participants[0]).getByRole('button', { name: 'Start the game' }).click();
    const watching: RoomParticipant = participants.at(-1) as RoomParticipant;
    await expect(status(watching)).toHaveText(/^Waiting for the apples of /);
    await watching.openHistory();
    return participants;
}

/** The players pick their apples: the count of the round shows on the page of the spectator */
async function played(players: ReadonlyArray<RoomParticipant>, spectator: RoomParticipant, apples: ReadonlyArray<Apple>, round: number): Promise<void> {
    await Promise.all(players.map((player: RoomParticipant, index: number) =>
        table(player).getByRole('button', { name: `${ apples[index] } apple`, exact: true }).click()));
    await expect(table(spectator).locator('#last-round')).toHaveText(new RegExp(String.raw`^\s*Round ${ round }:`));
}

test.describe('Garden of Eden', () => {
    test('plays the 13 rounds to the end, watched by a spectator, then a new game', SLOW, async ({ gardenOfEden }) => {
        test.setTimeout(120_000);
        const [alice, bob, carol, dave] = await started(gardenOfEden, ['alice', 'bob', 'carol'], 'dave', ['1,000 million']);
        const players: RoomParticipant[] = [alice, bob, carol];
        await expect(table(dave).locator('#terms')).toHaveText('Votes of 1 min · starting money 1,000 million');

        // Every apple red for 12 rounds, then the lone gold apple of Alice
        for (let round = 1; round <= 12; round++) {
            // eslint-disable-next-line no-await-in-loop -- the rounds one after the other
            await expect(table(dave).locator('#round')).toHaveText(`Round ${ round } of 13 · 3 players in`);
            // eslint-disable-next-line no-await-in-loop -- the rounds one after the other
            await played(players, dave, ['Red', 'Red', 'Red'], round);
        }
        await played(players, dave, ['Gold', 'Red', 'Red'], 13);

        await expect(status(dave)).toHaveText('The game is over.');
        await expect(table(dave).locator('#last-round'))
            .toHaveText('Round 13: 1 gold, 0 silver, 2 red. The lone gold apple of alice wins 200 million, the red ones lose 100 million');
        await expect(table(dave).locator('#winners')).toHaveText('Winner: alice');
        await expect(table(dave).locator('#standings tbody tr').first()).toContainText('+2,400 million');
        await expect(table(dave).locator('#seat-1')).toContainText('Balance: +2,100 million');
        await alice.sendMessage('well played');
        await dave.expectMessage('alice', 'well played');

        // A new game, its seats open
        await table(alice).getByRole('button', { name: 'Play again' }).click();
        await expect(status(alice)).toHaveText('Pick the time to vote and the starting money, then start the game.');
        await expect(dave.pastLines()).toHaveCount(1);
        await expect(dave.pastLines().first()).toHaveText('Game 1: Winner: alice, +2,400 million');
    });

    test('counts the rounds where every apple is red, a tie and a mix, the page keeping its place', async ({ gardenOfEden }) => {
        const [alice, bob, carol, dave, eve] = await started(gardenOfEden, ['alice', 'bob', 'carol', 'dave'], 'eve');
        const players: RoomParticipant[] = [alice, bob, carol, dave];
        await Promise.all([...players, eve].map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        await played(players, eve, ['Red', 'Red', 'Red', 'Red'], 1);
        await expect(table(eve).locator('#last-round')).toHaveText('Round 1: 0 gold, 0 silver, 4 red. Only red apples: each one wins 100 million');
        await expect(table(eve).locator('#seat-2')).toContainText('Balance: +100 million');

        await played(players, eve, ['Gold', 'Gold', 'Silver', 'Silver'], 2);
        await expect(table(eve).locator('#last-round')).toHaveText('Round 2: 2 gold, 2 silver, 0 red. As many gold as silver apples: none wins or loses');

        await played(players, eve, ['Red', 'Red', 'Gold', 'Silver'], 3);
        await expect(table(eve).locator('#last-round'))
            .toHaveText('Round 3: 1 gold, 1 silver, 2 red. The red apples lose 100 million, the gold and silver ones win 100 million');
        await expect(table(eve).locator('#round')).toHaveText('Round 4 of 13 · 4 players in');
        for (const participant of [...players, eve]) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('names the lone traitor, out of paradise, then ends once a single player is still in', async ({ gardenOfEden }) => {
        const [alice, bob, carol, dave, eve] = await started(gardenOfEden, ['alice', 'bob', 'carol', 'dave'], 'eve');

        // Alice alone picks red
        await played([alice, bob, carol, dave], eve, ['Red', 'Gold', 'Gold', 'Gold'], 1);
        await expect(table(eve).locator('#last-round'))
            .toHaveText('Round 1: 3 gold, 0 silver, 1 red. alice alone picked red and loses 1,000 million, the other apples win 100 million');
        await expect(eve.historyLines().first()).toHaveText('Round 1: alice loses paradise');
        await expect(table(eve).locator('#seat-0')).toContainText('Out');
        await expect(table(alice).locator('#actions')).toHaveText('You lost paradise: follow the rest of the game and the chat.');
        await expect(table(alice).getByRole('button', { name: 'Red apple', exact: true })).toHaveCount(0);

        // Out of paradise, Alice reloads without being asked to confirm
        await alice.reload();
        alice.expectUnloadPrompts(0);

        // Bob alone picks red, then Carol among the 2 players left
        await played([bob, carol, dave], eve, ['Red', 'Gold', 'Gold'], 2);
        await played([carol, dave], eve, ['Red', 'Silver'], 3);

        await expect(status(eve)).toHaveText('The game is over.');
        await expect(table(eve).locator('#winners')).toHaveText('Winner: dave');
        const standings: ReadonlyArray<ReadonlyArray<string>> = [
            ['Winner', 'dave', 'In paradise', '+300 million'],
            ['Place 2', 'carol', 'Out at round 3', '−800 million'],
            ['Place 3', 'bob', 'Out at round 2', '−900 million'],
            ['Place 4', 'alice', 'Out at round 1', '−1,000 million'],
        ];
        await expect(table(eve).locator('#standings tbody tr')).toHaveCount(standings.length);
        for (const [row, cells] of standings.entries()) {
            // eslint-disable-next-line no-await-in-loop -- each row in turn
            await expect(table(eve).locator('#standings tbody tr').nth(row).locator('td')).toHaveText(cells);
        }
    });

    test('keeps the apple sealed of a player reloading the page', async ({ gardenOfEden }) => {
        const [alice, bob, carol, dave] = await started(gardenOfEden, ['alice', 'bob', 'carol'], 'dave');

        // Bob picks his apple, then reloads the page
        await table(bob).getByRole('button', { name: 'Silver apple', exact: true }).click();
        await expect(table(dave).locator('#seat-1')).toContainText('Sealed');
        await bob.reload();
        bob.expectUnloadPrompts(1);

        await expect(table(bob).locator('#actions')).toHaveText('Your apple, silver, is sealed');
        await played([alice, carol], dave, ['Red', 'Red'], 1);
        await expect(table(dave).locator('#last-round'))
            .toHaveText('Round 1: 0 gold, 1 silver, 2 red. The lone silver apple of bob wins 200 million, the red ones lose 100 million');
    });

    test('takes 100 million from a player not voting in time, awaited still by the next vote', SLOW, async ({ gardenOfEden }) => {
        test.setTimeout(120_000);
        const [alice, bob, carol, dave, eve] = await started(gardenOfEden, ['alice', 'bob', 'carol', 'dave'], 'eve', ['30 s']);
        await expect(table(eve).locator('#terms')).toHaveText('Votes of 30 s · starting money 0 million');

        await Promise.all([alice, bob, carol].map((player: RoomParticipant) => table(player).getByRole('button', { name: 'Red apple', exact: true }).click()));
        await expect(table(eve).locator('#last-round')).toHaveText('Round 1: 0 gold, 0 silver, 3 red. Only red apples: each one wins 100 million', { timeout: 60_000 });
        await expect(eve.historyLines().nth(1)).toHaveText('dave: no apple in time, −100 million');
        await expect(table(eve).locator('#seat-3')).toContainText('Late');
        await expect(table(eve).locator('#seat-3')).toContainText('Balance: −100 million');

        // The next vote waits for Dave, back
        await expect(status(eve)).toHaveText('Waiting for the apples of alice, bob, carol, dave.');
        await played([alice, bob, carol, dave], eve, ['Red', 'Red', 'Red', 'Red'], 2);
        await expect(table(eve).locator('#seat-3')).not.toContainText('Late');
    });
});
