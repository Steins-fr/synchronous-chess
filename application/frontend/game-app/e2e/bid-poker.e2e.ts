import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { test as roomTest, TestRoom } from './test-room';

/** A room of the Bid Poker of its own for a test */
const test = roomTest.extend<{ bidPoker: TestRoom }>({
    bidPoker: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/bid-poker');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-bid-table');
const status = (participant: RoomParticipant): Locator => table(participant).getByRole('status');

/** What stays in place on the page of the Bid Poker while the game is played: the status, the lot auctioned, the actions */
const STEADY: ReadonlyArray<string> = ['app-bid-table output', '#auction', '#actions'];

/** Alice, Bob, Carol and Dave sit on the first seats, in that order, Eve watches */
async function seated(room: TestRoom): Promise<RoomParticipant[]> {
    const participants: RoomParticipant[] = await room.connect('alice', 'bob', 'carol', 'dave', 'eve');
    for (const [seat, player] of participants.slice(0, 4).entries()) {
        // eslint-disable-next-line no-await-in-loop -- the seats one after the other
        await table(player).locator(`#seat-${ seat }`).getByRole('button', { name: 'Sit here' }).click();
        // eslint-disable-next-line no-await-in-loop -- seated before the next one sits
        await expect(table(participants[4]).locator(`#seat-${ seat }`)).toContainText(player.name);
    }
    return participants;
}

/** Alice starts the game: the players draw the deck, the catalogue shows */
async function started(room: TestRoom): Promise<RoomParticipant[]> {
    const participants: RoomParticipant[] = await seated(room);
    await table(participants[0]).getByRole('button', { name: 'Start the game' }).click();
    await expect(status(participants[4])).toHaveText('Lot A on auction: waiting for alice, bob, carol, dave.');
    await participants[4].openHistory();
    return participants;
}

/** A player bids, none for no bid */
async function bid(player: RoomParticipant, amount: number | null): Promise<void> {
    if (amount === null) {
        await table(player).getByRole('button', { name: 'No bid' }).click();
        return;
    }
    await table(player).getByRole('spinbutton', { name: 'Your bid' }).fill(`${ amount }`);
    await table(player).getByRole('button', { name: 'Bid', exact: true }).click();
}

/** The players bid on the lot of a letter, none for no bid: the history of the spectator, open, tells the lot sold or not */
async function auction(players: ReadonlyArray<RoomParticipant>, spectator: RoomParticipant, letter: string, amounts: ReadonlyArray<number | null>): Promise<void> {
    await expect(table(spectator).locator('#auction h2')).toContainText(`Lot ${ letter }`);
    const told: number = await spectator.historyLines().count();
    await Promise.all(players.map((player: RoomParticipant, index: number) => bid(player, amounts[index])));
    await expect(spectator.historyLines()).toHaveCount(told + 1);
    await expect(spectator.historyLines().first()).toHaveText(new RegExp(`^Lot ${ letter }: `));
}

/** The players of the change session keep their cards */
async function keep(players: ReadonlyArray<RoomParticipant>): Promise<void> {
    await Promise.all(players.map((player: RoomParticipant) => table(player).getByRole('button', { name: 'Keep my cards' }).click()));
}

test.describe('Bid poker', () => {
    test('plays a game to its end, watched by a spectator, then a new one', async ({ bidPoker }) => {
        const [alice, bob, carol, dave, eve] = await started(bidPoker);
        const players: RoomParticipant[] = [alice, bob, carol, dave];
        const lots: number = await table(eve).locator('#catalogue app-bid-lot').count();
        expect([9, 10]).toContain(lots);

        // The dealing session: each player in turn buys a lot for 1 coin
        for (let lot = 0; lot < lots; lot++) {
            // eslint-disable-next-line no-await-in-loop -- the lots one after the other
            await auction(players, eve, String.fromCodePoint(65 + lot), players.map((_, index: number) => index === lot % 4 ? 1 : null));
        }

        // The first change session: Dave discards a card, Bob buys it
        await expect(status(dave)).toHaveText('Pick the cards to discard, in their order, or keep yours.');
        await table(dave).locator('#seat-3 app-card-hand button').first().click();
        await table(dave).getByRole('button', { name: 'Discard 1 card' }).click();
        await keep([alice, bob, carol]);
        await auction([alice, bob, carol], eve, 'A', [null, 2, null]);
        await expect(eve.historyLines().first()).toHaveText(/^Lot A: bob wins for 2 coins/);

        // The other change sessions: everyone keeps its cards
        for (let session = 2; session <= 5; session++) {
            // eslint-disable-next-line no-await-in-loop -- the sessions one after the other
            await expect(table(eve).locator('#session')).toHaveText(`Change session ${ session } of 5`);
            // eslint-disable-next-line no-await-in-loop -- the sessions one after the other
            await keep(players);
        }

        // Then every page shows the standings
        await expect(status(eve)).toHaveText('The game is over.');
        await expect(table(eve).locator('#standings tr')).toHaveCount(4);
        await expect(table(eve).locator('#standings')).toContainText('Pig');
        await alice.sendMessage('well played');
        await eve.expectMessage('alice', 'well played');

        // A new game, its seats open
        await table(alice).getByRole('button', { name: 'Play again' }).click();
        await expect(status(alice)).toHaveText('Start the game once every player is seated.');
        await expect(eve.pastLines()).toHaveCount(1);
        await expect(eve.pastLines().first()).toContainText(/Game 1: .* first, \d pigs?: /);
    });

    test('sells a lot to the first bid of the equal highest ones, the page keeping its place', async ({ bidPoker }) => {
        const [alice, bob, carol, dave, eve] = await started(bidPoker);
        await Promise.all([alice, bob, carol, dave, eve].map((participant: RoomParticipant) => watchSteadiness(participant.page, STEADY)));

        // The players bid one after the other, each bid sealed before the next: Bob bids as Alice did
        await bid(alice, 10);
        await expect(table(eve).locator('#seat-0')).toContainText('Sealed');
        await bid(bob, 10);
        await expect(table(eve).locator('#seat-1')).toContainText('Sealed');
        await bid(carol, null);
        await expect(table(eve).locator('#seat-2')).toContainText('Sealed');
        await bid(dave, null);

        await expect(table(eve).locator('#catalogue')).toContainText('To alice for 10 coins');
        await expect(eve.historyLines().first()).toHaveText('Lot A: alice wins for 10 coins, bid before bob (bids: alice 10, bob 10, carol 0, dave 0)');
        for (const participant of [alice, bob, carol, dave, eve]) {
            // eslint-disable-next-line no-await-in-loop -- each page in turn
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('takes a lot nobody bids on out of the game', async ({ bidPoker }) => {
        const [alice, bob, carol, dave, eve] = await started(bidPoker);

        await auction([alice, bob, carol, dave], eve, 'A', [null, null, null, null]);

        await expect(table(eve).locator('#catalogue app-bid-lot').first()).toContainText('Unsold: out of the game');
        await expect(status(eve)).toHaveText('Lot B on auction: waiting for alice, bob, carol, dave.');
    });

    test('keeps the bid sealed and the cards of a player reloading the page', async ({ bidPoker }) => {
        const [alice, bob, carol, dave, eve] = await started(bidPoker);
        // The lots hold 5 or 6 cards
        const sizes: number[] = await Promise.all([0, 1].map((lot: number) => table(eve).locator('#catalogue app-bid-lot').nth(lot).locator('app-playing-card').count()));
        await auction([alice, bob, carol, dave], eve, 'A', [null, 7, null, null]);

        // Bob bids on lot B, then reloads the page
        await bid(bob, 3);
        await expect(table(eve).locator('#seat-1')).toContainText('Sealed');
        await bob.reload();
        bob.expectUnloadPrompts(1);

        await expect(table(bob).locator('#actions')).toHaveText('Your bid of 3 coins is sealed');
        await expect(table(bob).locator('#seat-1 app-playing-card')).toHaveCount(sizes[0]);
        await Promise.all([alice, carol, dave].map((player: RoomParticipant) => bid(player, null)));

        await expect(table(eve).locator('#catalogue')).toContainText('To bob for 3 coins');
        await expect(table(bob).locator('#seat-1 app-playing-card')).toHaveCount(sizes[0] + sizes[1]);
        await expect(table(eve).locator('#bank')).toHaveText('Bank: 10 coins');
    });
});
