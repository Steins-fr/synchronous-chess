import { expect, Locator } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test as roomTest, TestRoom } from './test-room';

/** A room of the chess of its own for a test: a game holding its chat beside it */
const test = roomTest.extend<{ chess: TestRoom }>({
    chess: async ({ browser }, use) => {
        const room: TestRoom = new TestRoom(browser, '/synchronous-chess');
        await use(room);
        await room.close();
    },
});

/** The button of the bar of the room opening and closing the chat of a participant */
const chatToggle = (participant: RoomParticipant): Locator => participant.page.locator('#room-chat-toggle');

/** The button of the bar of the room opening and closing the history of the game of a participant */
const historyToggle = (participant: RoomParticipant): Locator => participant.page.locator('#room-history-toggle');

/** The panel of the room of a participant, beside the game or over it: open or closed */
const panel = (participant: RoomParticipant): Locator => participant.page.locator('#room-panel');

/** The chat in the panel of the room of a participant: shown while the panel holds it */
const chatPanel = (participant: RoomParticipant): Locator => participant.page.locator('#room-chat');

/** The history of the game in the panel of the room of a participant: shown while the panel holds it */
const historyPanel = (participant: RoomParticipant): Locator => participant.page.locator('#room-history');

test.describe('Chat of a game', () => {
    test('opens beside the game, counts the messages received while closed, and stays as the player left it', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');

        // Bob arrived after Alice: only she sees him join
        await expect(alice.page.locator('#chat-log')).toContainText('bob joined the room');
        await expect(bob.page.locator('#chat-log')).toContainText('No messages yet');

        // Open beside the game on a wide screen
        await expect(panel(bob)).toBeVisible();
        await expect(chatPanel(bob)).toBeVisible();
        // The debug button of the local environment lies beside the panel, never under it: once the game narrowed for the
        // panel, which opens with the room
        await expect(async () => {
            const debugButton = await bob.page.locator('#webrtc-debug-open').boundingBox();
            const roomPanel = await panel(bob).boundingBox();
            if (debugButton === null || roomPanel === null) {
                throw new Error('The debug button or the panel is not shown');
            }
            expect(debugButton.x + debugButton.width).toBeLessThanOrEqual(roomPanel.x);
        }).toPass();
        await expect(chatToggle(bob)).toHaveAttribute('aria-expanded', 'true');
        await chatToggle(bob).click();
        await expect(panel(bob)).toBeHidden();

        // Closed, it counts the new messages, shown from the first one once open
        await alice.sendMessage('hello');
        await expect(chatToggle(bob).locator('.mat-badge-content')).toHaveText('1');
        await chatToggle(bob).click();
        await expect(bob.page.locator('#unread-divider')).toBeVisible();
        await bob.expectMessage('alice', 'hello');
        await expect(chatToggle(bob).locator('.mat-badge-content')).toBeHidden();

        // Closed again, it stays closed once the page reloaded
        await chatToggle(bob).click();
        await bob.reload();
        await expect(chatToggle(bob)).toHaveAttribute('aria-expanded', 'false');
        await expect(panel(bob)).toBeHidden();
    });

    test('shares the panel beside the game with the history, the chat counting its messages while the history shows', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');
        await expect(chatPanel(bob)).toBeVisible();

        // The history takes the place of the chat in the panel
        await historyToggle(bob).click();
        await expect(historyPanel(bob)).toBeVisible();
        await expect(historyPanel(bob)).toContainText('Nothing yet.');
        await expect(chatPanel(bob)).toBeHidden();
        await expect(historyToggle(bob)).toHaveAttribute('aria-expanded', 'true');
        await expect(chatToggle(bob)).toHaveAttribute('aria-expanded', 'false');

        // The chat hidden counts the new messages on its button, shown once it takes the panel back
        await alice.sendMessage('hello');
        await expect(chatToggle(bob).locator('.mat-badge-content')).toHaveText('1');
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeVisible();
        await expect(historyPanel(bob)).toBeHidden();
        await bob.expectMessage('alice', 'hello');
        await expect(chatToggle(bob).locator('.mat-badge-content')).toBeHidden();

        // The history closed by its button closes the panel, never remembered: the chat shows once the page reloaded
        await historyToggle(bob).click();
        await bob.page.locator('#history-close').click();
        await expect(panel(bob)).toBeHidden();
        await bob.reload();
        await expect(chatPanel(bob)).toBeVisible();
        await expect(historyToggle(bob)).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens over the game on a phone, closed by the back gesture without leaving the match', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');
        await alice.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play white' }).click();
        await bob.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play black' }).click();
        await expect(bob.page.locator('app-sync-chess-game #seat-top')).toHaveText('White player: alice');

        // Closed over the game on a phone
        await bob.narrow(390, 800);
        await expect(panel(bob)).toBeHidden();
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeVisible();
        await bob.sendMessage('hi');
        await alice.expectMessage('bob', 'hi');

        // The back gesture closes it, the page and its match kept
        const url: string = bob.page.url();
        await bob.page.goBack();
        await expect(panel(bob)).toBeHidden();
        expect(bob.page.url()).toEqual(url);
        await expect(bob.page.getByRole('dialog')).toHaveCount(0);
        bob.expectUnloadPrompts(0);
        await expect(bob.page.locator('app-sync-chess-game #seat-bottom')).toContainText('Black player: bob');

        // Closed by its button, as by Escape
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeVisible();
        await bob.page.locator('#chat-close').click();
        await expect(panel(bob)).toBeHidden();
        expect(bob.page.url()).toEqual(url);
    });

    test('opens the history over the game on a phone, closed by the back gesture without leaving the match', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');
        await alice.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play white' }).click();
        await bob.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play black' }).click();
        await expect(bob.page.locator('app-sync-chess-game #seat-top')).toHaveText('White player: alice');

        // Over the game on a phone, closed when the page shows
        await bob.narrow(390, 800);
        await expect(panel(bob)).toBeHidden();
        await bob.openHistory();
        await expect(panel(bob)).toBeVisible();
        await expect(chatPanel(bob)).toBeHidden();

        // The back gesture closes it, the page and its match kept
        const url: string = bob.page.url();
        await bob.page.goBack();
        await expect(panel(bob)).toBeHidden();
        expect(bob.page.url()).toEqual(url);
        await expect(bob.page.getByRole('dialog')).toHaveCount(0);
        bob.expectUnloadPrompts(0);
        await expect(bob.page.locator('app-sync-chess-game #seat-bottom')).toContainText('Black player: bob');
    });
});
