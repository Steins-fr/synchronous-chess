import { expect, Locator } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { SLOW, test as roomTest, TestRoom } from './test-room';

/** A room of the roulette of its own for a test */
const test = roomTest.extend<{ roulette: TestRoom }>({
    roulette: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/russian-roulette');
        await use(room);
        await room.close();
    },
});

/** The table of the page of a participant */
const table = (participant: RoomParticipant): Locator => participant.page.locator('app-roulette-table');

/** The labels of the chambers of the cylinder of a participant, which tell the bullets of the ones fired */
async function chambers(participant: RoomParticipant): Promise<string[]> {
    return table(participant).locator('app-roulette-cylinder [role="img"]')
        .evaluateAll((views: Element[]) => views.map((view: Element) => view.getAttribute('aria-label') as string));
}

/** Alice sits on the first seat, at the bottom of her table, Bob on the second one, Carol watches */
async function seated(room: TestRoom): Promise<RoomParticipant[]> {
    const [alice, bob, carol] = await room.connect('alice', 'bob', 'carol');
    await table(alice).locator('#seat-bottom').getByRole('button', { name: 'Sit here' }).click();
    await expect(table(bob).locator('#seat-bottom')).toContainText('alice');
    await table(bob).getByRole('button', { name: 'Sit here' }).click();
    await expect(table(carol).locator('#seat-top')).toContainText('bob');
    return [alice, bob, carol];
}

/** A player picks the chambers of its bullets, numbered from 1, then loads them */
async function load(participant: RoomParticipant, numbers: ReadonlyArray<number>): Promise<void> {
    for (const number of numbers) {
        // eslint-disable-next-line no-await-in-loop -- the chambers one after the other
        await table(participant).getByRole('button', { name: `Chamber ${ number }`, exact: true }).click();
    }
    await table(participant).getByRole('button', { name: 'Load (3/3)' }).click();
}

/** Both players load their bullets: once the cylinder is spun, the player drawn plays first */
async function loaded(alice: RoomParticipant, bob: RoomParticipant, carol: RoomParticipant): Promise<void> {
    await expect(table(alice).getByRole('status')).toHaveText('Pick the chambers of your 3 bullets, then load them.');
    await load(alice, [1, 2, 4]);
    await load(bob, [11, 13, 21]);
    await expect(table(carol).getByRole('status')).toHaveText(/^(alice|bob) shoots or passes…$/);
}

/** The player the game waits for */
async function actor(alice: RoomParticipant, bob: RoomParticipant, carol: RoomParticipant): Promise<RoomParticipant> {
    return (await table(carol).getByRole('status').textContent())?.startsWith('alice') ? alice : bob;
}

/** A shot shows once the revolver held 3.5 seconds in front of the player, then fired */
const SHOT_TIME: number = 10_000;

/** The player to act shoots or passes, the spectator seeing the move */
async function play(move: 'Shoot' | RegExp, alice: RoomParticipant, bob: RoomParticipant, carol: RoomParticipant): Promise<void> {
    const before: string = await table(carol).locator('#last-move').count() > 0 ? await table(carol).locator('#last-move').innerText() : '';
    await table(await actor(alice, bob, carol)).getByRole('button', { name: move }).click({ timeout: SHOT_TIME });
    await expect(table(carol).locator('#last-move')).not.toHaveText(before, { timeout: SHOT_TIME });
}

test.describe('Russian roulette', () => {
    test('plays a game to its end, the spectator seeing the chambers once fired only', SLOW, async ({ roulette }) => {
        // Up to 24 shots of 5 seconds
        test.setTimeout(240_000);
        const [alice, bob, carol] = await seated(roulette);
        await loaded(alice, bob, carol);
        expect((await chambers(carol)).every((label: string) => /^Chamber \d+$/.test(label))).toBe(true);

        // The players shoot until the 6 bullets fired
        // eslint-disable-next-line no-await-in-loop -- the moves one after the other
        while (await table(carol).locator('.badge').count() === 0) {
            // eslint-disable-next-line no-await-in-loop -- the moves one after the other
            await play('Shoot', alice, bob, carol);
        }

        await expect(table(carol).locator('.badge')).toHaveText(/(alice|bob) wins the game: \d against \d deaths?, with \d+ chips\.|Draw/);
        await expect(table(carol).getByText('The cylinder was fair.')).toBeVisible();
        const fired: string[] = (await chambers(carol)).filter((label: string) => label.includes(':'));
        const bullets: number = fired.filter((label: string) => label.endsWith('a bullet')).length + 2 * fired.filter((label: string) => label.endsWith('two bullets')).length;
        expect(bullets).toEqual(6);
        expect(await chambers(alice)).toEqual(await chambers(carol));
        await expect(table(alice).getByRole('button', { name: 'Play again' })).toBeVisible();
    });

    test('gives the table to the bank after 5 passes in a row, and reveals the next chamber', async ({ roulette }) => {
        const [alice, bob, carol] = await seated(roulette);
        await loaded(alice, bob, carol);

        for (const price of [1, 2, 4, 8, 16]) {
            // eslint-disable-next-line no-await-in-loop -- the moves one after the other
            await play(new RegExp(String.raw`^Pass \(${ price }\)$`), alice, bob, carol);
        }

        await expect(table(carol).locator('#bank')).toHaveText('Bank: 31');
        await expect(table(carol).locator('#table-chips')).toHaveText('Table: 0 chips');
        await expect(table(carol).locator('#last-move')).toHaveText(/The 5th pass of (alice|bob) reveals chamber 1: (empty|a bullet, spent|two bullets, spent)\./, { timeout: SHOT_TIME });
        await table(carol).getByText('Moves of the game').click();
        await expect(table(carol).locator('details li').nth(1)).toHaveText(/(alice|bob) passes, 16 chips: the 5th pass in a row, the bank takes the table\./);
        expect((await chambers(carol))[0]).toMatch(/^Chamber 1: /);
        await expect(table(await actor(alice, bob, carol)).getByRole('button', { name: 'Pass (1)' })).toBeVisible();
    });

    test('plays a shot with reduced motion, the revolver firing without moving', async ({ roulette }) => {
        const [alice, bob, carol] = await seated(roulette);
        await Promise.all([alice, bob, carol].map(({ page }) => page.emulateMedia({ reducedMotion: 'reduce' })));
        await loaded(alice, bob, carol);

        await play('Shoot', alice, bob, carol);

        await expect(table(carol).locator('#last-move')).toHaveText(/fires chamber 1:/);
        await expect(table(await actor(alice, bob, carol)).getByRole('button', { name: /^Pass/ })).toBeVisible({ timeout: SHOT_TIME });
    });

    test('gives back their place in the game to a player reloading the page', SLOW, async ({ roulette }) => {
        const [alice, bob, carol] = await seated(roulette);
        await loaded(alice, bob, carol);
        await play('Shoot', alice, bob, carol);
        const fired: string[] = await chambers(carol);

        await bob.reloadAndJoin(roulette.id);

        await expect.poll(() => chambers(bob)).toEqual(fired);
        await expect(table(bob).locator('#seat-bottom')).toContainText('bob');
        await play('Shoot', alice, bob, carol);
        await expect(table(carol).locator('#last-move')).toHaveText(/fires chamber 2:/);
    });

    test('plays the move of a player once its time is over: a pass', SLOW, async ({ roulette }) => {
        // A move of 45 seconds
        test.setTimeout(120_000);
        const [alice, bob, carol] = await seated(roulette);
        await loaded(alice, bob, carol);
        const late: RoomParticipant = await actor(alice, bob, carol);

        await expect(table(carol).locator('#last-move')).toHaveText(`${ late === alice ? 'alice' : 'bob' } passes: 1 chip on the table.`, { timeout: 60_000 });
    });

    test('ends the game of a player away once the time of its move is over, 30 seconds more', SLOW, async ({ roulette }) => {
        // A move of 45 seconds and 30 more
        test.setTimeout(150_000);
        const [alice, bob, carol] = await seated(roulette);
        await loaded(alice, bob, carol);
        // Bob leaves the room on his turn
        if (await actor(alice, bob, carol) === alice) {
            await play(/^Pass/, alice, bob, carol);
        }

        await bob.close();

        await expect(table(carol).getByRole('status')).toHaveText('Waiting for bob to come back…');
        await expect(table(carol).locator('.badge-win')).toHaveText('bob ran out of time: alice wins the game.', { timeout: 90_000 });
        await expect(table(carol).locator('#seat-top')).toContainText('Free seat');
    });
});
