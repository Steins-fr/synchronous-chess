import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { test } from './test-room';

// The snapshots of the DOM of a trace run in the page with a user gesture, which activates it as a person does: the trace
// of a failure keeps the actions, the network, the console and the screenshots only
test.use({ trace: { mode: 'retain-on-failure', snapshots: false } });

// The list of the open rooms is asked again every 15 seconds (OpenRoomsComponent.REFRESH_INTERVAL)
const REFRESH_INTERVAL: number = 15_000;

/** A page loaded by a bot rendering it, a crawler running JavaScript: the paused database of the API stays asleep */
test.describe('Bots', () => {
    test('asks nothing of the API for a page only loaded, as by a bot, until a person acts on it', async ({ room }) => {
        // Given
        const alice: RoomParticipant = await room.create('alice');
        await alice.expectParticipants(['alice']);

        // When
        const bot: RoomParticipant = await room.load('bot', { fakeClock: true });

        // Then: the database of the API, paused, stays asleep, the time of a refresh of the list passed too
        await expect(bot.page.getByRole('button', { name: 'Show the open rooms' })).toBeVisible();
        await bot.passTime(REFRESH_INTERVAL);
        bot.expectNoApiRequest();
        bot.expectNoApiSocket();

        // When: a person moves the pointer over the page
        await bot.page.mouse.move(100, 100);

        // Then
        await bot.expectOpenRoom(room.name, false);
    });

    test('lists the rooms of a page reloaded, by a person only, before any gesture', async ({ room }) => {
        // Given: a page the pointer never moved over
        const alice: RoomParticipant = await room.create('alice');
        await alice.expectParticipants(['alice']);
        const reloading: RoomParticipant = await room.load('reloading');
        reloading.expectNoApiRequest();

        // When
        await reloading.page.reload({ waitUntil: 'networkidle' });

        // Then
        await reloading.expectOpenRoom(room.name, false);
        await expect(reloading.page.getByRole('button', { name: 'Show the open rooms' })).toBeHidden();
    });
});
