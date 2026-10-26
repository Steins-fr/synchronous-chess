import { expect, Locator, Page } from '@playwright/test';
import { movedElements, watchSteadiness } from './page-steadiness';
import { RoomParticipant } from './room-participant';
import { test as roomTest, TestRoom } from './test-room';

/** A room of the chess of its own for a test */
const test = roomTest.extend<{ chess: TestRoom }>({
    chess: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/synchronous-chess');
        await use(room);
        await room.close();
    },
});

/** The game of the page of a participant */
const game = (participant: RoomParticipant): Locator => participant.page.locator('app-sync-chess-game');

/** What stays in place on the page of the chess while the game is played: the seats, the board, the page below it */
const STEADY: ReadonlyArray<string> = ['#seat-top', '#board-grid', '#seat-bottom', 'app-sync-chess-game .spectators'];

/**
 * A player drags a piece from a cell to another one, by their index in the board as it shows it: rank 8 first, rank 1
 * first for the board seen from black
 */
async function drag(page: Page, from: number, to: number): Promise<void> {
    const cells: Locator = page.locator('#board-grid mat-grid-tile');
    const origin = await cells.nth(from).boundingBox();
    const target = await cells.nth(to).boundingBox();
    if (origin === null || target === null) {
        throw new Error('A cell is not shown');
    }
    await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2);
    await page.mouse.down();
    // A first small move starts the drag
    await page.mouse.move(origin.x + origin.width / 2 + 5, origin.y + origin.height / 2 + 5);
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
    await page.mouse.up();
}

test.describe('Synchronous chess', () => {
    test('seats each player at the bottom of its board, the page keeping its place until the end of the game', async ({ chess }) => {
        const participants: RoomParticipant[] = await chess.connect('alice', 'bob', 'carol');
        const [alice, bob, carol] = participants;
        // The whole board in the window, to drag its pieces
        await Promise.all(participants.map(({ page }) => page.setViewportSize({ width: 700, height: 1100 })));
        await Promise.all(participants.map(({ page }) => watchSteadiness(page, STEADY)));

        // A single seat to take, at the bottom: white, then black once white is taken
        await game(alice).locator('#seat-bottom').getByRole('button', { name: 'Play white' }).click();
        await expect(game(bob).locator('#seat-top')).toHaveText('White player: alice');
        await expect(game(bob).locator('.row-labels').first()).toHaveText(/1\s*2\s*3\s*4\s*5\s*6\s*7\s*8/);
        await game(bob).locator('#seat-bottom').getByRole('button', { name: 'Play black' }).click();
        await expect(game(carol).locator('#seat-top')).toHaveText('Black player: bob');
        await expect(game(carol).locator('#seat-bottom')).toHaveText('White player: alice');

        // The fool's mate, black seeing its board from its side: f3 and e5, then g4 and Qh4
        await drag(alice.page, 53, 45);
        await drag(bob.page, 51, 35);
        await expect(game(carol).locator('.player-information.top-player')).toContainText('E7 -> E5');
        await drag(alice.page, 54, 38);
        await drag(bob.page, 60, 24);

        await expect(game(carol).locator('.game-result')).toHaveText('Checkmate: Black wins');
        for (const participant of participants) {
            // eslint-disable-next-line no-await-in-loop -- the pages one after the other
            expect(await movedElements(participant.page), participant.name).toEqual([]);
        }
    });

    test('gives back its seat and its move to a player reloading the page, and asks the players to confirm leaving the game', async ({ chess }) => {
        const participants: RoomParticipant[] = await chess.connect('alice', 'bob', 'carol');
        const [alice, bob, carol] = participants;
        await Promise.all(participants.map(({ page }) => page.setViewportSize({ width: 700, height: 1100 })));
        await game(alice).locator('#seat-bottom').getByRole('button', { name: 'Play white' }).click();
        await expect(game(bob).locator('#seat-top')).toHaveText('White player: alice');
        await game(bob).locator('#seat-bottom').getByRole('button', { name: 'Play black' }).click();
        await expect(game(alice).locator('#seat-top')).toHaveText('Black player: bob');

        // White plays f3 and Black reloads its page, the game started: the browser asks to confirm
        await drag(alice.page, 53, 45);
        // The seats fixed once the game started: no player leaves its seat anymore
        await expect(game(bob).getByRole('button', { name: 'Leave the seat' })).toHaveCount(0);
        await bob.reload();
        bob.expectUnloadPrompts(1);
        await expect(game(bob).locator('#seat-bottom')).toHaveText('Black player: bob', { timeout: 60_000 });
        // Black may play once the page caught up with the game: its pawn shows its moves
        await expect(async () => {
            await bob.page.locator('#board-grid mat-grid-tile').nth(51).click();
            await expect(bob.page.locator('.valid-move')).toHaveCount(2, { timeout: 1000 });
        }).toPass();
        await drag(bob.page, 51, 35);
        await expect(game(carol).locator('.player-information.top-player')).toContainText('E7 -> E5');

        // The spectator leaves through the app at once
        await carol.page.getByRole('link', { name: 'Home' }).click();
        await expect(carol.page).toHaveURL(/\/$/);

        // A player is asked, staying on the page once it cancels
        await alice.page.getByRole('link', { name: 'Home' }).click();
        // The dialogs of the app lie in an overlay of their own
        const dialog: Locator = alice.page.locator('.dialog-overlay');
        await expect(dialog).toContainText('Leave the game?');
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(alice.page).toHaveURL(/\/synchronous-chess\?room=/);
        await alice.page.getByRole('link', { name: 'Home' }).click();
        await dialog.getByRole('button', { name: 'Confirm' }).click();
        await expect(alice.page).toHaveURL(/\/$/);
    });
});
