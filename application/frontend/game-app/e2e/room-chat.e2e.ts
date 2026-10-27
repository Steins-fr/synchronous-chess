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

/** The panel of the chat of a participant, beside the game or over it */
const chatPanel = (participant: RoomParticipant): Locator => participant.page.locator('#room-chat');

test.describe('Chat of a game', () => {
    test('opens beside the game, counts the messages received while closed, and stays as the player left it', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');

        // Bob arrived after Alice: only she sees him join
        await expect(alice.page.locator('#chat-log')).toContainText('bob joined the room');
        await expect(bob.page.locator('#chat-log')).toContainText('No messages yet');

        // Open beside the game on a wide screen
        await expect(chatPanel(bob)).toBeVisible();
        // The debug button of the local environment lies beside the chat, never under it: once the game narrowed for the
        // chat, which opens with the room
        await expect(async () => {
            const debugButton = await bob.page.locator('#webrtc-debug-open').boundingBox();
            const chat = await chatPanel(bob).boundingBox();
            if (debugButton === null || chat === null) {
                throw new Error('The debug button or the chat is not shown');
            }
            expect(debugButton.x + debugButton.width).toBeLessThanOrEqual(chat.x);
        }).toPass();
        await expect(chatToggle(bob)).toHaveAttribute('aria-expanded', 'true');
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeHidden();

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
        await expect(chatPanel(bob)).toBeHidden();
    });

    test('opens over the game on a phone, closed by the back gesture without leaving the match', async ({ chess }) => {
        const [alice, bob] = await chess.connect('alice', 'bob');
        await alice.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play white' }).click();
        await bob.page.locator('app-sync-chess-game #seat-bottom').getByRole('button', { name: 'Play black' }).click();
        await expect(bob.page.locator('app-sync-chess-game #seat-top')).toHaveText('White player: alice');

        // Closed over the game on a phone
        await bob.narrow(390, 800);
        await expect(chatPanel(bob)).toBeHidden();
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeVisible();
        await bob.sendMessage('hi');
        await alice.expectMessage('bob', 'hi');

        // The back gesture closes it, the page and its match kept
        const url: string = bob.page.url();
        await bob.page.goBack();
        await expect(chatPanel(bob)).toBeHidden();
        expect(bob.page.url()).toEqual(url);
        await expect(bob.page.getByRole('dialog')).toHaveCount(0);
        bob.expectUnloadPrompts(0);
        await expect(bob.page.locator('app-sync-chess-game #seat-bottom')).toContainText('Black player: bob');

        // Closed by its button, as by Escape
        await chatToggle(bob).click();
        await expect(chatPanel(bob)).toBeVisible();
        await bob.page.locator('#chat-close').click();
        await expect(chatPanel(bob)).toBeHidden();
        expect(bob.page.url()).toEqual(url);
    });
});
