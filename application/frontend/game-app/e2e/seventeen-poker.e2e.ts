import { expect, Locator } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test as roomTest, TestRoom } from './test-room';

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

/** Alice sits on the first seat, at the bottom of her table, Bob on the second one, Carol watches */
async function seated(room: TestRoom): Promise<RoomParticipant[]> {
    const [alice, bob, carol] = await room.connect('alice', 'bob', 'carol');
    await table(alice).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
    await expect(table(bob).locator('#seat-bottom')).toContainText('alice');
    await table(bob).getByRole('button', { name: 'Sit here' }).click();
    await expect(table(carol).locator('#seat-top')).toContainText('bob');
    return [alice, bob, carol];
}

/** Deals the hand: each player reads its cards, at the bottom of its table */
async function deal(alice: RoomParticipant, bob: RoomParticipant): Promise<void> {
    await table(alice).getByRole('button', { name: 'Deal' }).click();
    await expect(table(alice).getByRole('status')).toHaveText('Your turn.');
    await expect.poll(() => cardsOf(alice, 1)).not.toContain('Face-down card');
    await expect(table(bob).getByRole('status')).toHaveText('alice to speak.');
}

async function cardsOf(participant: RoomParticipant, index: number): Promise<string[]> {
    return hand(participant, index).evaluateAll((images: Element[]) => images.map((image: Element) => image.getAttribute('aria-label') as string));
}

test.describe('Seventeen poker', () => {
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
        await expect(table(carol).getByRole('status')).toHaveText('Waiting for a player to deal the hand.');
        const shown: string[] = await cardsOf(carol, 1);
        expect(shown).not.toContain('Face-down card');
        expect(shown.slice(2)).toEqual(aliceCards.slice(2));
        expect(await cardsOf(carol, 0)).not.toContain('Face-down card');
        expect(await cardsOf(alice, 0)).toEqual(await cardsOf(carol, 0));
        await table(carol).getByText('Hands played').click();
        await expect(table(carol).locator('details li')).toContainText(/^Hand 1: (alice|bob) takes the pot of 22 with|^Hand 1: equal hands/);
    });

    test('gives the pot to the other player when a player folds, the folded hand staying hidden', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);

        await table(alice).getByRole('button', { name: 'Bet 1' }).click();
        await table(bob).getByRole('button', { name: 'Fold' }).click();

        await expect(table(carol).locator('#seat-bottom')).toContainText('155 chips');
        await expect(table(carol).locator('#seat-top')).toContainText('145 chips');
        expect(await cardsOf(carol, 0)).toEqual(FACE_DOWN);
        expect(await cardsOf(carol, 1)).toEqual(FACE_DOWN);
        await table(carol).getByText('Hands played').click();
        await expect(table(carol).locator('details li')).toHaveText('Hand 1: bob folds, alice takes the pot of 11.');
    });

    test('gives back their cards and their seat to a player reloading the page', async ({ poker }) => {
        const [alice, bob, carol] = await seated(poker);
        await deal(alice, bob);
        await table(alice).getByRole('button', { name: 'Check' }).click();
        await expect(table(bob).getByRole('status')).toHaveText('Your turn.');
        const bobCards: string[] = await cardsOf(bob, 1);

        await bob.reloadAndJoin(poker.name);

        await expect(table(bob).getByRole('status')).toHaveText('Your turn.');
        expect(await cardsOf(bob, 1)).toEqual(bobCards);
        await table(bob).getByRole('button', { name: 'Check' }).click();
        await expect(table(carol).getByRole('status')).toHaveText('Waiting for a player to deal the hand.');
        await table(carol).getByText('Hands played').click();
        await expect(table(carol).locator('details li')).toHaveText('Hand 1: no contest, the antes go to the bank.');
    });
});
