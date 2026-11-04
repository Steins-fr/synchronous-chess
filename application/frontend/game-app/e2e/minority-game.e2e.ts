import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of the Minority Game of its own for a test */
const test = roomTest.extend<{ minorityGame: TestRoom }>({
    minorityGame: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/minority-game');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-minority-table');
const status = (participant: RoomParticipant): Locator => table(participant).getByRole('status');

/** What stays in place on the page of the Minority Game while the game is played: the status, the question, the actions */
const STEADY: ReadonlyArray<string> = ['app-minority-table output', '#question', '#actions'];

type Vote = 'Yes' | 'No';

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

/** The first player starts the game with the options picked: the players draw who asks, the first question waits */
async function started(room: TestRoom, players: ReadonlyArray<string>, spectator: string, picks: ReadonlyArray<string> = []): Promise<RoomParticipant[]> {
    const participants: RoomParticipant[] = await seated(room, players, spectator);
    for (const pick of picks) {
        // eslint-disable-next-line no-await-in-loop -- each pick shows before the next one
        await table(participants[0]).getByRole('radio', { name: pick, exact: true }).click();
    }
    await table(participants[0]).getByRole('button', { name: 'Start the game' }).click();
    const watching: RoomParticipant = participants.at(-1) as RoomParticipant;
    await expect(status(watching)).toHaveText(/ asks a question…$/);
    await watching.openHistory();
    return participants;
}

/** The asker drawn asks its question, told by the status of the spectator: the vote opens on every page */
async function asked(players: ReadonlyArray<RoomParticipant>, spectator: RoomParticipant, question: string): Promise<RoomParticipant> {
    await expect(status(spectator)).toHaveText(/ asks a question…$/);
    const name: string = (await status(spectator).textContent() as string).replace(/ asks a question…$/, '').trim();
    const asker: RoomParticipant = players.find((player: RoomParticipant) => player.name === name) as RoomParticipant;
    await table(asker).getByRole('textbox', { name: 'Your question' }).fill(question);
    await table(asker).getByRole('button', { name: 'Ask', exact: true }).click();
    await expect(table(spectator).locator('#question-text')).toHaveText(`“${ question }”`);
    return asker;
}

/** The players vote: the history of the spectator, open, tells the count */
async function voted(players: ReadonlyArray<RoomParticipant>, spectator: RoomParticipant, votes: ReadonlyArray<Vote>): Promise<void> {
    const told: number = await spectator.historyLines().count();
    await Promise.all(players.map((player: RoomParticipant, index: number) => table(player).getByRole('button', { name: votes[index], exact: true }).click()));
    await expect(spectator.historyLines()).toHaveCount(told + 1);
}

test.describe('Minority game', () => {
    test('plays an elimination game to its end, watched by a spectator, then a new one', async ({ minorityGame }) => {
        const [alice, bob, carol, dave, eve] = await started(minorityGame, ['alice', 'bob', 'carol', 'dave'], 'eve');
        const players: RoomParticipant[] = [alice, bob, carol, dave];
        await expect(table(eve).locator('#stakes')).toHaveText('Prize pool: 400 million');

        // A unanimous vote eliminates nobody: another player asks
        const first: RoomParticipant = await asked(players, eve, 'Do you like the rain?');
        await voted(players, eve, ['Yes', 'Yes', 'Yes', 'Yes']);
        await expect(table(eve).locator('#last-vote')).toHaveText('Question 1: 4 yes, 0 no. Nobody eliminated: a new question');
        await expect(status(eve)).not.toHaveText(`${ first.name } asks a question…`);

        // The majority is eliminated: Dave alone is left
        await asked(players, eve, 'Will you vote no?');
        await voted(players, eve, ['Yes', 'Yes', 'Yes', 'No']);
        await expect(status(eve)).toHaveText('The game is over.');
        await expect(table(eve).locator('#winners')).toHaveText('Winner: dave');
        await expect(table(eve).locator('#standings tbody tr')).toHaveCount(4);
        await expect(table(eve).locator('#standings tbody tr').first()).toContainText('300 million');
        await expect(eve.historyLines().first()).toHaveText('Question 2: 3 yes, 1 no. Eliminated: alice, bob, carol');
        await alice.sendMessage('well played');
        await eve.expectMessage('alice', 'well played');

        // A new game, its seats open
        await table(alice).getByRole('button', { name: 'Play again' }).click();
        await expect(status(alice)).toHaveText('Pick the variant and the time to vote, then start the game.');
        await expect(eve.pastLines()).toHaveCount(1);
        await expect(eve.pastLines().first()).toHaveText('Game 1: Winner: dave');
    });

    test('asks a new question after a tie, the page keeping its place', async ({ minorityGame }) => {
        const [alice, bob, carol, dave, eve] = await started(minorityGame, ['alice', 'bob', 'carol', 'dave'], 'eve');
        const players: RoomParticipant[] = [alice, bob, carol, dave];
        await Promise.all([...players, eve].map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        await asked(players, eve, 'Is it sunny today?');
        await voted(players, eve, ['Yes', 'No', 'No', 'Yes']);
        await expect(table(eve).locator('#last-vote')).toHaveText('Question 1: 2 yes, 2 no. Nobody eliminated: a new question');
        await expect(table(eve).locator('#round')).toHaveText('Question 2 · 4 players in');

        // A question after a count: nothing moved, the standings of the end growing the page only once it is over
        await asked(players, eve, 'Is it rainy today?');
        await Promise.all(players.map((player: RoomParticipant) => expect(table(player).locator('#question-text')).toHaveText('“Is it rainy today?”')));
        for (const participant of [...players, eve]) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
        await voted(players, eve, ['Yes', 'Yes', 'No', 'Yes']);
        await expect(table(eve).locator('#winners')).toHaveText('Winner: carol');
    });

    test('eliminates a player not voting in time, a spectator then', SLOW, async ({ minorityGame }) => {
        test.setTimeout(120_000);
        const [alice, bob, carol, dave, eve] = await started(minorityGame, ['alice', 'bob', 'carol', 'dave'], 'eve', ['30 s']);
        const players: RoomParticipant[] = [alice, bob, carol, dave];
        await expect(table(eve).locator('#variant')).toHaveText('Elimination · votes of 30 s');

        await asked(players, eve, 'Do you like the rain?');
        await Promise.all([alice, bob, carol].map((player: RoomParticipant) => table(player).getByRole('button', { name: 'Yes', exact: true }).click()));
        await expect(eve.historyLines().first()).toHaveText('Question 1: 3 yes, 0 no. Eliminated: dave', { timeout: 60_000 });
        await expect(eve.historyLines().nth(1)).toHaveText('dave: no vote in time');
        await expect(table(dave).locator('#actions')).toHaveText('You are eliminated: follow the rest of the game and the chat.');
        await expect(table(eve).locator('#seat-3')).toContainText('Eliminated');

        // Out of the game, Dave reloads without being asked to confirm
        await dave.reload();
        dave.expectUnloadPrompts(0);

        await asked([alice, bob, carol], eve, 'Will you vote no?');
        await expect(table(dave).getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0);
        await voted([alice, bob, carol], eve, ['Yes', 'Yes', 'No']);
        await expect(table(eve).locator('#winners')).toHaveText('Winner: carol');
    });

    test('plays a score game of 10 rounds, nobody eliminated', SLOW, async ({ minorityGame }) => {
        test.setTimeout(120_000);
        const [alice, bob, carol, dave] = await started(minorityGame, ['alice', 'bob', 'carol'], 'dave', ['Score']);
        const players: RoomParticipant[] = [alice, bob, carol];
        await expect(table(dave).locator('#variant')).toHaveText('Score · votes of 1 min');

        // Carol alone votes no, scoring the 2 votes of the majority, but at the last round, unanimous
        for (let round = 1; round <= 10; round++) {
            // eslint-disable-next-line no-await-in-loop -- the rounds one after the other
            await expect(table(dave).locator('#round')).toHaveText(`Round ${ round } of 10`);
            // eslint-disable-next-line no-await-in-loop -- the rounds one after the other
            await asked(players, dave, `Question number ${ round }?`);
            // eslint-disable-next-line no-await-in-loop -- the rounds one after the other
            await voted(players, dave, round === 10 ? ['Yes', 'Yes', 'Yes'] : ['Yes', 'Yes', 'No']);
        }

        await expect(status(dave)).toHaveText('The game is over.');
        await expect(dave.historyLines().first()).toHaveText('Round 10: 3 yes, 0 no. Nobody scores');
        await expect(table(dave).locator('#winners')).toHaveText('Winner: carol');
        await expect(table(dave).locator('#standings tbody tr').first()).toContainText('18 points');
        await table(alice).getByRole('button', { name: 'Play again' }).click();
        await expect(dave.pastLines().first()).toHaveText('Game 1: First place, 18 points: carol');
    });

    test('keeps the vote sealed of a player reloading the page', async ({ minorityGame }) => {
        const [alice, bob, carol, dave] = await started(minorityGame, ['alice', 'bob', 'carol'], 'dave');
        const players: RoomParticipant[] = [alice, bob, carol];
        await asked(players, dave, 'Do you like the rain?');

        // Bob votes, then reloads the page
        await table(bob).getByRole('button', { name: 'No', exact: true }).click();
        await expect(table(dave).locator('#seat-1')).toContainText('Sealed');
        await bob.reload();
        bob.expectUnloadPrompts(1);

        await expect(table(bob).locator('#actions')).toHaveText('Your vote, no, is sealed');
        await voted([alice, carol], dave, ['Yes', 'Yes']);
        await expect(table(dave).locator('#winners')).toHaveText('Winner: bob');
    });
});
