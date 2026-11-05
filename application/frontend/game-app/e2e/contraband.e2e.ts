import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of Contraband of its own for a test */
const test = roomTest.extend<{ contraband: TestRoom }>({
    contraband: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/contraband');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-contraband-table');
const status = (participant: RoomParticipant): Locator => table(participant).getByRole('status');

/** What stays in place on the page of Contraband while the match is played: the status, the customs, the actions */
const STEADY: ReadonlyArray<string> = ['app-contraband-table output', '#customs', '#actions'];

/** The first seat of each country: the North holds the seats 0 to 3, the South the seats 4 to 7 */
const NORTH_SEAT: number = 0;
const SOUTH_SEAT: number = 4;

/** What a smuggler packs: millions in the classic variant, a bar in the Gold Rush */
type Trunk = number | 'Gold bar' | 'Iron bar';
/** What an inspector calls: a pass, a check in the Gold Rush, a doubt of millions in the classic variant */
type Call = 'Pass' | 'Check' | number;

/** The players of a match, the North ones first, and the spectator hosting the room: it orders the chain */
interface Match {
    readonly north: ReadonlyArray<RoomParticipant>;
    readonly south: ReadonlyArray<RoomParticipant>;
    readonly spectator: RoomParticipant;
}

/** The pair of a game, drawn: read from the page of the spectator */
interface Pair {
    readonly smuggler: RoomParticipant;
    readonly inspector: RoomParticipant;
}

/** The spectator hosts the room, the players sit in their countries, in their order */
async function seated(room: TestRoom, north: ReadonlyArray<string>, south: ReadonlyArray<string>, spectator: string): Promise<Match> {
    const [watching, ...players]: RoomParticipant[] = await room.connect(spectator, ...north, ...south);
    const match: Match = { north: players.slice(0, north.length), south: players.slice(north.length), spectator: watching };
    const seats: ReadonlyArray<[number, RoomParticipant]> = [
        ...match.north.map((player: RoomParticipant, index: number): [number, RoomParticipant] => [NORTH_SEAT + index, player]),
        ...match.south.map((player: RoomParticipant, index: number): [number, RoomParticipant] => [SOUTH_SEAT + index, player]),
    ];
    for (const [seat, player] of seats) {
        // eslint-disable-next-line no-await-in-loop -- the seats one after the other
        await table(player).locator(`#seat-${ seat }`).getByRole('button', { name: 'Sit here' }).click();
        // eslint-disable-next-line no-await-in-loop -- seated before the next one sits
        await expect(table(watching).locator(`#seat-${ seat }`)).toContainText(player.name);
    }
    return match;
}

/** The first North player starts the match with the options picked: the players draw the pairs, the first trunk is packed */
async function started(room: TestRoom, north: ReadonlyArray<string>, south: ReadonlyArray<string>, spectator: string, picks: ReadonlyArray<string> = []): Promise<Match> {
    const match: Match = await seated(room, north, south, spectator);
    for (const pick of picks) {
        // eslint-disable-next-line no-await-in-loop -- each pick shows before the next one
        await table(match.north[0]).getByRole('radio', { name: pick, exact: true }).click();
    }
    await table(match.north[0]).getByRole('button', { name: 'Start the game' }).click();
    await expect(status(match.spectator)).toHaveText(/ packs a trunk…$/);
    await match.spectator.openHistory();
    return match;
}

/** The pair of the game, once its trunk is packed, read from the page of the spectator: the pairs are drawn */
async function pairOf(match: Match, game: number): Promise<Pair> {
    const watching: Locator = table(match.spectator);
    await expect(watching.locator('#crossing')).toHaveText(new RegExp(`^Game ${ game } of `));
    await expect(status(match.spectator)).toHaveText(/ packs a trunk…$/);
    const named = async (selector: string, label: string): Promise<RoomParticipant> => {
        const name: string = (await watching.locator(selector).textContent() as string).replace(label, '').trim();
        return [...match.north, ...match.south].find((player: RoomParticipant) => player.name === name) as RoomParticipant;
    };
    return { smuggler: await named('#smuggler', 'Smuggler:'), inspector: await named('#inspector', 'Inspector:') };
}

/** The smuggler packs its trunk: the customs open on every page */
async function packed(match: Match, pair: Pair, trunk: Trunk): Promise<void> {
    if (typeof trunk === 'number') {
        await table(pair.smuggler).getByRole('spinbutton', { name: 'Trunk (millions)' }).fill(`${ trunk }`);
        await table(pair.smuggler).getByRole('button', { name: 'Pack the trunk', exact: true }).click();
    } else {
        await table(pair.smuggler).getByRole('button', { name: trunk, exact: true }).click();
    }
    await expect(status(match.spectator)).toHaveText(`${ pair.inspector.name } inspects the trunk of ${ pair.smuggler.name }…`);
}

/** The inspector calls: the page of the smuggler reveals the trunk, the history of the spectator tells the game */
async function called(match: Match, pair: Pair, game: number, call: Call): Promise<void> {
    if (typeof call === 'number') {
        await table(pair.inspector).getByRole('spinbutton', { name: 'Doubt (millions)' }).fill(`${ call }`);
        await table(pair.inspector).getByRole('button', { name: 'Doubt', exact: true }).click();
    } else {
        await table(pair.inspector).getByRole('button', { name: call, exact: true }).click();
    }
    await expect(match.spectator.historyLines()).toHaveCount(game);
}

/** A game played: the pair drawn, the trunk packed, the call, the trunk revealed */
async function crossed(match: Match, game: number, moves: (pair: Pair) => Readonly<{ trunk: Trunk; call: Call }>): Promise<Pair> {
    const pair: Pair = await pairOf(match, game);
    const { trunk, call } = moves(pair);
    await packed(match, pair, trunk);
    await called(match, pair, game, call);
    return pair;
}

/** Each game of a match, one after the other, its moves picked by the country of its smuggler */
async function played(match: Match, games: number, moves: (pair: Pair, fromNorth: boolean) => Readonly<{ trunk: Trunk; call: Call }>): Promise<void> {
    for (let game = 1; game <= games; game++) {
        // eslint-disable-next-line no-await-in-loop -- the games one after the other
        await crossed(match, game, (pair: Pair) => moves(pair, match.north.includes(pair.smuggler)));
    }
}

/** The title of the customs conversation of a game */
const customsTitle = (game: number, pair: Pair): string => `Customs of game ${ game }: ${ pair.smuggler.name } and ${ pair.inspector.name }`;

test.describe('Contraband', () => {
    test('plays a classic game in 1 against 1, watched by a spectator', async ({ contraband }) => {
        const match: Match = await started(contraband, ['alice'], ['bob'], 'carol');
        const [alice, bob, carol] = [match.north[0], match.south[0], match.spectator];
        await expect(table(carol).locator('#variant')).toHaveText('Classic · customs of 2 min');
        await expect(table(carol).locator('#seat-0')).toContainText('ATM: 300 million');
        await expect(table(carol).locator('#seat-0')).toContainText('Account: 100 million');

        // The North smuggles first: the trunk sealed for every other page
        const pair: Pair = await pairOf(match, 1);
        expect(pair).toEqual({ smuggler: alice, inspector: bob });
        await expect(status(alice)).toHaveText('Pack your trunk: it stays sealed until the call.');
        await packed(match, pair, 40);
        await expect(table(alice).locator('#actions')).toHaveText('Your trunk holds 40 million, sealed');
        await expect(table(carol).locator('#trunk')).toHaveText('Sealed');
        await expect(status(bob)).toHaveText('Pass, or doubt an amount.');

        // A doubt under the contents: the trunk goes through, the inspector paying half of its doubt
        await called(match, pair, 1, 30);
        const told: string = 'Game 1: bob doubts 30 million, alice smuggles 40 million and receives 15 million';
        await expect(table(carol).locator('#last-crossing')).toHaveText(told);
        await expect(carol.historyLines().first()).toHaveText(told);
        await expect(table(carol).locator('#seat-0')).toContainText('ATM: 260 million');
        await expect(table(carol).locator('#seat-0')).toContainText('Account: 155 million');
        await expect(table(carol).locator('#seat-4')).toContainText('Account: 85 million');

        // The South smuggles the next game
        await expect(table(carol).locator('#crossing')).toHaveText('Game 2 of 10');
        await expect(status(bob)).toHaveText('Pack your trunk: it stays sealed until the call.');
        await expect(status(alice)).toHaveText('bob packs a trunk…');
    });

    test('plays the four classic calls in 2 against 2, the customs and the countries talking privately, the page keeping its place', async ({ contraband }) => {
        const match: Match = await started(contraband, ['alice', 'bob'], ['carol', 'dave'], 'eve');
        const [alice, bob] = match.north;
        const eve: RoomParticipant = match.spectator;
        const everyone: RoomParticipant[] = [...match.north, ...match.south, eve];
        await Promise.all(everyone.map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        // The countries talk privately: the South reads nothing of the North, the spectator has no conversation
        await bob.sendPrivate('Northern country', 'doubt them all');
        await alice.openPrivate();
        await alice.selectPrivate('Northern country');
        await expect(alice.privateLines()).toContainText(['bob: doubt them all']);
        await expect(eve.page.locator('#room-private-toggle')).toHaveCount(0);

        // The first game: the smuggler and the inspector talk in their customs, the others have no tab of it
        const first: Pair = await pairOf(match, 1);
        expect(first.smuggler).toBe(alice);
        await packed(match, first, 40);
        await first.smuggler.sendPrivate(customsTitle(1, first), 'nothing to declare');
        await first.inspector.selectPrivate(customsTitle(1, first));
        await expect(first.inspector.privateLines()).toContainText(['alice: nothing to declare']);
        const southMate: RoomParticipant = match.south.find((player: RoomParticipant) => player !== first.inspector) as RoomParticipant;
        for (const outsider of [bob, southMate]) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await outsider.openPrivate();
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            await expect(outsider.privateTabs()).toHaveCount(1);
        }
        await expect(bob.privateTabs()).toHaveText(['Northern country']);
        await expect(southMate.privateTabs()).toHaveText(['Southern country']);

        // A pass: the contents go through
        await called(match, first, 1, 'Pass');
        await expect(eve.historyLines().first()).toHaveText(`Game 1: ${ first.inspector.name } lets alice pass, 40 million smuggled`);
        // The customs over stay readable, closed
        await first.inspector.selectPrivate(customsTitle(1, first));
        await expect(first.inspector.page.locator('#private-closed')).toHaveText('This conversation is closed: it can still be read');

        // A doubt of an empty trunk: the inspector pays half of it
        const second: Pair = await crossed(match, 2, () => ({ trunk: 0, call: 30 }));
        await expect(eve.historyLines().first()).toHaveText(`Game 2: ${ second.inspector.name } doubts 30 million of an empty trunk, and pays ${ second.smuggler.name } 15 million`);

        // A doubt of the contents or more: the inspector seizes them
        const third: Pair = await crossed(match, 3, () => ({ trunk: 50, call: 50 }));
        expect(third.smuggler).toBe(bob);
        await expect(eve.historyLines().first()).toHaveText(`Game 3: ${ third.inspector.name } doubts 50 million and seizes 50 million from bob`);

        // A doubt under the contents: they go through, with half of the doubt, halves included
        const fourth: Pair = await crossed(match, 4, () => ({ trunk: 60, call: 21 }));
        await expect(eve.historyLines().first())
            .toHaveText(`Game 4: ${ fourth.inspector.name } doubts 21 million, ${ fourth.smuggler.name } smuggles 60 million and receives 10.5 million`);
        await expect(table(eve).locator('#crossing')).toHaveText('Game 5 of 10');

        for (const participant of everyone) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('plays a classic match of 10 games to its end, then a new one', async ({ contraband }) => {
        const match: Match = await started(contraband, ['alice', 'bob'], ['carol', 'dave'], 'eve');
        const eve: RoomParticipant = match.spectator;

        // The North smuggles 20 million through each time, the South packs nothing and is paid 5 million of each doubt
        await played(match, 10, (_pair: Pair, fromNorth: boolean) => fromNorth ? { trunk: 20, call: 'Pass' } : { trunk: 0, call: 10 });

        await expect(status(eve)).toHaveText('The match is over.');
        await expect(table(eve).locator('#winners')).toHaveText('The Northern country wins by 150 million');
        await expect(table(eve).locator('#standings tbody tr')).toHaveCount(4);
        await expect(table(eve).locator('#trunk')).toHaveText('Empty');
        await expect(eve.historyLines()).toHaveCount(10);

        // A new match, its seats open
        await table(match.north[0]).getByRole('button', { name: 'Play again' }).click();
        await expect(status(match.north[0])).toHaveText('Pick the variant, the customs and the games, then start.');
        await expect(eve.pastLines()).toHaveCount(1);
        await expect(eve.pastLines().first()).toHaveText('Match 1: The Northern country wins by 150 million');
    });

    test('plays a Gold Rush match to its end, gold and iron, passed and checked', async ({ contraband }) => {
        const match: Match = await started(contraband, ['alice'], ['bob'], 'carol', ['Gold Rush']);
        const [alice, carol] = [match.north[0], match.spectator];
        await expect(table(carol).locator('#variant')).toHaveText('Gold Rush · customs of 2 min');

        // Alice smuggles the odd games, Bob the even ones
        const moves: ReadonlyArray<Readonly<{ trunk: Trunk; call: Call; told: string }>> = [
            { trunk: 'Gold bar', call: 'Pass', told: 'Game 1: bob lets alice pass, 100 million smuggled' },
            { trunk: 'Iron bar', call: 'Check', told: 'Game 2: alice checks an iron bar, and pays bob 100 million' },
            { trunk: 'Iron bar', call: 'Pass', told: 'Game 3: bob lets alice pass, 0 million smuggled' },
            { trunk: 'Gold bar', call: 'Check', told: 'Game 4: alice checks and seizes 100 million from bob' },
            { trunk: 'Gold bar', call: 'Check', told: 'Game 5: bob checks and seizes 100 million from alice' },
            { trunk: 'Gold bar', call: 'Pass', told: 'Game 6: alice lets bob pass, 100 million smuggled' },
            { trunk: 'Gold bar', call: 'Pass', told: 'Game 7: bob lets alice pass, 100 million smuggled' },
            { trunk: 'Iron bar', call: 'Pass', told: 'Game 8: alice lets bob pass, 0 million smuggled' },
            { trunk: 'Iron bar', call: 'Check', told: 'Game 9: bob checks an iron bar, and pays alice 100 million' },
            { trunk: 'Iron bar', call: 'Pass', told: 'Game 10: alice lets bob pass, 0 million smuggled' },
        ];
        for (const [index, move] of moves.entries()) {
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            const pair: Pair = await pairOf(match, index + 1);
            if (index === 8) {
                // Her ATM emptied, Alice has no gold bar left to pack
                // eslint-disable-next-line no-await-in-loop -- the games one after the other
                await expect(table(alice).getByRole('button', { name: 'Gold bar', exact: true })).toBeDisabled();
            }
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            await packed(match, pair, move.trunk);
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            await called(match, pair, index + 1, move.call);
            // eslint-disable-next-line no-await-in-loop -- the games one after the other
            await expect(carol.historyLines().first()).toHaveText(move.told);
        }

        await expect(status(carol)).toHaveText('The match is over.');
        await expect(table(carol).locator('#winners')).toHaveText('The Northern country wins by 200 million');
        await expect(table(carol).locator('#seat-0')).toContainText('+100 million');
        await expect(table(carol).locator('#seat-4')).toContainText('−100 million');
    });

    test('keeps the trunk sealed and the customs talk of a smuggler reloading the page', async ({ contraband }) => {
        const match: Match = await started(contraband, ['alice'], ['bob'], 'carol');
        const [alice, bob, carol] = [match.north[0], match.south[0], match.spectator];
        const pair: Pair = await pairOf(match, 1);
        await packed(match, pair, 40);
        await alice.sendPrivate(customsTitle(1, pair), 'only clothes inside');
        await bob.selectPrivate(customsTitle(1, pair));
        await expect(bob.privateLines()).toContainText(['alice: only clothes inside']);

        // Alice reloads: her trunk stays sealed, her customs talk readable, and she reads the answer
        await alice.reload();
        alice.expectUnloadPrompts(1);
        await expect(table(alice).locator('#actions')).toHaveText('Your trunk holds 40 million, sealed');
        await alice.selectPrivate(customsTitle(1, pair));
        await expect(alice.privateLines()).toContainText(['alice: only clothes inside']);
        await bob.sendPrivate(customsTitle(1, pair), 'I will check');
        await expect(alice.privateLines()).toContainText(['alice: only clothes inside', 'bob: I will check']);

        // Her page reveals the trunk sealed before the reload
        await called(match, pair, 1, 40);
        await expect(table(carol).locator('#last-crossing')).toHaveText('Game 1: bob doubts 40 million and seizes 40 million from alice');
    });

    test('seizes the most a trunk holds once its smuggler does not reveal it', SLOW, async ({ contraband }) => {
        test.setTimeout(120_000);
        const match: Match = await started(contraband, ['alice'], ['bob'], 'carol');
        const [alice, bob, carol] = [match.north[0], match.south[0], match.spectator];
        const pair: Pair = await pairOf(match, 1);
        await packed(match, pair, 10);

        // Alice leaves with her trunk sealed: Bob claims the reveal once its time and the time of an away player are over
        await alice.close();
        await table(bob).getByRole('button', { name: 'Pass', exact: true }).click();
        await expect(status(carol)).toHaveText('Waiting for alice to come back…');
        const told: string = 'Game 1: the trunk of alice is not revealed in time, bob seizes 100 million';
        await expect(carol.historyLines().first()).toHaveText(told, { timeout: 60_000 });
        await expect(table(carol).locator('#seat-4')).toContainText('Account: 200 million');
        await expect(table(carol).locator('#seat-0')).toContainText('ATM: 200 million');
        await expect(table(carol).locator('#seat-0')).toContainText('Late');
        await expect(status(bob)).toHaveText('Pack your trunk: it stays sealed until the call.');
    });
});
