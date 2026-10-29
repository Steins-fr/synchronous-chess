import { expect } from '@playwright/test';
import { RoomParticipant } from './room-participant';
import { SLOW, test } from './test-room';

/** A participant sending too many messages: every page hides the same ones, its composer waits */
test.describe('Flood of the chat', () => {
    const flood: string[] = Array.from({ length: 20 }, (_, index: number) => `flood ${ index + 1 }`);
    // The 8 first messages of the flood show, the rest hidden: the receivers allow 8 messages in 10 seconds of the chain
    const shown: string[] = flood.slice(0, 8).map((text: string) => `bob: ${ text }`);
    const notice: string = 'bob sends too many messages: they are hidden for a moment';

    test('hides alike on every page a flood sent around the composer, until its rate falls back', SLOW, async ({ room }) => {
        // Given
        const [alice, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        await bob.transmitAroundComposer(flood);

        // Then: told once, the author apart
        await expect(alice.chatBubbles()).toHaveText(shown);
        await expect(alice.chatNotices(notice)).toHaveCount(1);
        await expect(bob.chatBubbles()).toHaveText(shown);
        await expect(bob.chatNotices('You sent too many messages: they are hidden for a moment')).toHaveCount(1);

        // When: the rate of bob fell back, 10 seconds of the chain later
        await bob.page.waitForTimeout(11_000);
        await bob.sendMessage('sorry');

        // Then
        await expect(alice.chatBubbles()).toHaveText([...shown, 'bob: sorry']);

        // When: a page reloaded, and a participant joining late
        await alice.reload();
        const carol: RoomParticipant = await room.join('carol');

        // Then: the history hidden alike
        for (const participant of [alice, carol]) {
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await expect(participant.chatBubbles()).toHaveText([...shown, 'bob: sorry']);
            // eslint-disable-next-line no-await-in-loop -- one after the other, within the same timeout
            await expect(participant.chatNotices(notice)).toHaveCount(1);
        }
    });

    test('waits before sending a 4th message within 10 seconds, counting down', async ({ room }) => {
        // Given
        const [, bob]: RoomParticipant[] = await room.connect('alice', 'bob');

        // When
        for (const text of ['one', 'two', 'three']) {
            // eslint-disable-next-line no-await-in-loop -- one message after the other
            await bob.sendMessage(text);
        }
        await bob.page.getByRole('textbox', { name: 'Type your message' }).fill('four');

        // Then: Send disabled, the hint telling the seconds left
        await expect(bob.page.getByRole('button', { name: 'Send' })).toBeDisabled();
        await expect(bob.page.getByRole('textbox', { name: 'Type your message' })).toHaveAccessibleDescription(/^Wait \d+ seconds? before sending another message$/);

        // When / Then: sent once the first one left the window
        await expect(bob.page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 12_000 });
        await bob.page.getByRole('button', { name: 'Send' }).click();
        await expect(bob.chatBubbles()).toHaveText(['bob: one', 'bob: two', 'bob: three', 'bob: four']);
    });
});
