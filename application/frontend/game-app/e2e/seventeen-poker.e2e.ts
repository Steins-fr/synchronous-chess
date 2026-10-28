import { expect, Locator } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of the poker of its own for a test */
const test = roomTest.extend<{ poker: TestRoom }>({
    poker: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/seventeen-poker');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-poker-table');

/** The cards of a hand, from the top of the table, but the ones thrown away while they leave it */
function hand(participant: RoomParticipant, index: number): Locator {
    return table(participant).locator('app-card-hand').nth(index).locator('li:not(.card-discarded) [role="img"]');
}

const FACE_DOWN: string[] = Array.from({ length: 5 }, () => 'Face-down card');

/** What stays in place on the page of the poker while the match is played: the seats, the status, the page below the table */
const STEADY: ReadonlyArray<string> = ['#seat-top', '#seat-bottom', 'app-poker-table output', '.rules-details'];

/** Alice sits on the first seat, at the bottom of her table, Bob on the second one, Carol watches */
async function seated(room: TestRoom): Promise<RoomParticipant[]> {
    const [alice, bob, carol] = await room.connect('alice', 'bob', 'carol');
    await table(alice).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
    await expect(table(bob).locator('#seat-top')).toContainText('alice');
    await table(bob).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
    await expect(table(carol).locator('#seat-top')).toContainText('bob');
    return [alice, bob, carol];
}

/** Bob, on the second seat, deals the first hand: each player reads its cards, at the bottom of its table */
async function deal(alice: RoomParticipant, bob: RoomParticipant): Promise<void> {
    await expect(table(alice).getByRole('status')).toHaveText('bob to deal.');
    await table(bob).getByRole('button', { name: 'Deal' }).click();
    await expect(table(alice).getByRole('status')).toHaveText('Your turn.');
    await expect.poll(() => cardsOf(alice, 1)).not.toContain('Face-down card');
    await expect(table(bob).getByRole('status')).toHaveText('alice to speak.');
}

/**
 * Alice and Bob bet all their chips, then keep their hands: the showdown ends the match, unless the hands are equal and
 * split the pot, Carol watching. Then they play the next hand the same way
 */
async function allIn(alice: RoomParticipant, bob: RoomParticipant, carol: RoomParticipant, index: number = 0): Promise<void> {
    const [dealer, first] = index % 2 === 0 ? [bob, alice] : [alice, bob];
    await table(dealer).getByRole('button', { name: 'Deal' }).click();
    await table(first).getByRole('button', { name: 'Max' }).click();
    await table(first).getByRole('button', { name: 'Bet 145' }).click();
    await table(dealer).getByRole('button', { name: 'Call 145' }).click();
    await table(first).getByRole('button', { name: 'Keep my hand' }).click();
    await table(dealer).getByRole('button', { name: 'Keep my hand' }).click();
    await table(first).getByRole('button', { name: 'Check' }).click();
    await table(dealer).getByRole('button', { name: 'Check' }).click();
    await expect(table(carol).locator('#hand-outcome')).toContainText(`Hand ${ index + 1 }:`);

    if (!await table(carol).locator('.badge-win').isVisible()) {
        await allIn(alice, bob, carol, index + 1);
    }
}

async function cardsOf(participant: RoomParticipant, index: number): Promise<string[]> {
    return hand(participant, index).evaluateAll((images: Element[]) => images.map((image: Element) => image.getAttribute('aria-label') as string));
}

test.describe('Seventeen poker', () => {
    test('keeps the seats, the status and the page below the table in place until the match is over', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await Promise.all([alice, bob, carol].map(({ page }) => watchSteadiness(page, STEADY)));

        // The hands dealt, the bets, the exchange, the showdown and the result of the match
        await allIn(alice, bob, carol);
        await expect(table(carol).getByText('Every deck was fair.')).toBeVisible();

        for (const participant of [alice, bob, carol]) {
            // eslint-disable-next-line no-await-in-loop -- the pages one after the other
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('plays a hand to the showdown, the spectator seeing the hands then only', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);
        const aliceCards: string[] = await cardsOf(alice, 1);
        expect(aliceCards).not.toContain('Face-down card');
        expect(await cardsOf(bob, 0)).toEqual(FACE_DOWN);
        expect(await cardsOf(carol, 0)).toEqual(FACE_DOWN);
        expect(await cardsOf(carol, 1)).toEqual(FACE_DOWN);

        // First round: Alice bets 6 chips, Bob calls
        await table(alice).getByRole('button', { name: 'Bet more' }).click();
        await table(alice).getByRole('button', { name: 'Bet 6' }).click();
        await table(bob).getByRole('button', { name: 'Call 6' }).click();

        // Exchange: Alice discards her first two cards, Bob keeps his hand
        await expect(table(alice).getByRole('status')).toHaveText('Select the cards to discard, then exchange them.');
        const aliceHand: Locator = table(alice).locator('app-card-hand').nth(1).getByRole('button');
        await aliceHand.nth(0).click();
        await aliceHand.nth(1).click();
        await expect(aliceHand.first()).toHaveAttribute('aria-pressed', 'true');
        await table(alice).getByRole('button', { name: 'Exchange 2 cards' }).click();
        await table(bob).getByRole('button', { name: 'Keep my hand' }).click();

        // Second round: both players check
        await table(alice).getByRole('button', { name: 'Check' }).click();
        await table(bob).getByRole('button', { name: 'Check' }).click();

        // Showdown: everyone sees both hands, Alice keeping 3 of her cards
        await expect(table(carol).getByRole('status')).toHaveText('alice to deal.');
        const shown: string[] = await cardsOf(carol, 1);
        expect(shown).not.toContain('Face-down card');
        expect(shown.slice(2)).toEqual(aliceCards.slice(2));
        expect(await cardsOf(carol, 0)).not.toContain('Face-down card');
        expect(await cardsOf(alice, 0)).toEqual(await cardsOf(carol, 0));
        await carol.openHistory();
        await expect(carol.historyLines()).toContainText(/^Hand 1: (alice|bob) takes the pot of 22 with|^Hand 1: equal hands/);
    });

    test('plays the move of a player once its time is over: a check, then a fold against a bet', SLOW, async ({ poker }) => {
        // Two moves of 45 seconds each
        test.setTimeout(180_000);
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);
        await expect(table(carol).locator('#seat-bottom').getByText(/ s$/)).toBeVisible();

        // Alice lets her 45 seconds run out: her page checks for her
        await expect(table(bob).getByRole('status')).toHaveText('Your turn.', { timeout: 60_000 });
        await expect(table(alice).locator('#seat-top').getByText(/ s$/)).toBeVisible();
        await table(bob).getByRole('button', { name: 'Bet 1' }).click();

        // Against a bet, her page folds for her
        await carol.openHistory();
        await expect(carol.historyLines()).toHaveText('Hand 1: alice folds, bob takes the pot of 11.', { timeout: 60_000 });
    });

    test('ends the match of a player away once the time of its move is over, 30 seconds more, freeing its seat', SLOW, async ({ poker }) => {
        // A move of 45 seconds and 30 more
        test.setTimeout(150_000);
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);
        await table(alice).getByRole('button', { name: 'Check' }).click();
        await expect(table(bob).getByRole('status')).toHaveText('Your turn.');

        await bob.close();

        await expect(table(carol).getByRole('status')).toHaveText('Waiting for bob to come back…');
        await expect(table(carol).locator('.badge-win')).toHaveText('bob was away when the time ran out: alice wins the match.', { timeout: 90_000 });
        await carol.openHistory();
        await expect(carol.historyLines()).toHaveText('Hand 1: bob folds, alice takes the pot of 10.');

        // Bob lost his seat: Carol takes it, Alice starts a new match, the decks of the first one waiting for his keys
        await table(carol).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
        await table(alice).getByRole('button', { name: 'Play again' }).click();
        await expect(table(alice).getByRole('status')).toHaveText('carol to deal.');
        await alice.openHistory();
        await expect(alice.pastLines()).toHaveText(/Match 1: bob was away when the time ran out: alice wins the match\.\s+Checking every deck…/);
        await table(carol).getByRole('button', { name: 'Deal' }).click();
        await expect(table(alice).getByRole('status')).toHaveText('Your turn.');
    });

    test('gives the pot to the other player when a player folds, the folded hand staying hidden', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);

        await table(alice).getByRole('button', { name: 'Bet 1' }).click();
        await table(bob).getByRole('button', { name: 'Fold' }).click();

        await expect(table(carol).locator('#seat-bottom')).toContainText('155 chips');
        await expect(table(carol).locator('#seat-top')).toContainText('145 chips');
        await expect(table(carol).locator('#seat-bottom')).toContainText('+11');
        await expect(table(carol).locator('#hand-outcome')).toHaveText('Hand 1: bob folds, alice takes the pot of 11.');
        expect(await cardsOf(carol, 0)).toEqual(FACE_DOWN);
        expect(await cardsOf(carol, 1)).toEqual(FACE_DOWN);
        await carol.openHistory();
        await expect(carol.historyLines()).toHaveText('Hand 1: bob folds, alice takes the pot of 11.');
    });

    test('plays a new match once the first one is over, a spectator taking the seat of a player', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);

        // The first match: a hand takes the chips of the other player
        await allIn(alice, bob, carol);
        await expect(table(carol).locator('.badge-win')).toHaveText(/(alice|bob) wins the match with 300 chips\./);
        await expect(table(carol).getByText('Every deck was fair.')).toBeVisible();

        // Alice leaves her seat, Carol takes it and starts a new match
        await table(alice).getByRole('button', { name: 'Leave the seat' }).click();
        await table(carol).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
        await expect(table(alice).locator('#seat-bottom')).toContainText('carol');
        await table(carol).getByRole('button', { name: 'Play again' }).click();

        await expect(table(alice).getByRole('status')).toHaveText('bob to deal.');
        await expect(table(alice).locator('.badge-win')).toHaveCount(0);
        await expect(table(alice).locator('#seat-bottom')).toContainText('150 chips');
        await expect(table(alice).locator('#seat-top')).toContainText('150 chips');
        await alice.openHistory();
        await expect(alice.pastLines()).toHaveText(/Match 1: (alice|bob) wins the match with 300 chips\./);

        // Bob deals the first hand of the new match, Carol speaking first
        await table(bob).getByRole('button', { name: 'Deal' }).click();
        await expect(table(carol).getByRole('status')).toHaveText('Your turn.');
        await expect.poll(() => cardsOf(carol, 1)).not.toContain('Face-down card');
        await expect(table(alice).getByText('Hand 1 of 10')).toBeVisible();
        expect(await cardsOf(alice, 1)).toEqual(FACE_DOWN);
    });

    test('gives back their cards and their seat to a player reloading the page', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);
        await table(alice).getByRole('button', { name: 'Check' }).click();
        await expect(table(bob).getByRole('status')).toHaveText('Your turn.');
        const bobCards: string[] = await cardsOf(bob, 1);

        await bob.reload();

        bob.expectUnloadPrompts(1);
        await expect(table(bob).getByRole('status')).toHaveText('Your turn.');
        expect(await cardsOf(bob, 1)).toEqual(bobCards);
        await table(bob).getByRole('button', { name: 'Check' }).click();
        await expect(table(carol).getByRole('status')).toHaveText('alice to deal.');
        // The history of Bob holds the hand his page played before and after its reload
        await bob.openHistory();
        await expect(bob.historyLines()).toHaveText('Hand 1: no contest, the antes go to the bank.');
    });
});
