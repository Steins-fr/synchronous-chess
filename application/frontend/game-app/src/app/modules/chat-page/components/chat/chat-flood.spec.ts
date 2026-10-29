import { admitChatMessage, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW, ChatAdmission, ChatFlood, NO_FLOOD } from './chat-flood';
import { describe, expect, test } from 'vitest';

/** The messages of the chain in their order, by author and time: whether each one shows, and is noticed */
function admit(messages: ReadonlyArray<readonly [string, number]>, flood: ChatFlood = NO_FLOOD): { flood: ChatFlood; shown: boolean[]; notices: boolean[] } {
    const shown: boolean[] = [];
    const notices: boolean[] = [];
    for (const [author, time] of messages) {
        const admission: ChatAdmission = admitChatMessage(flood, author, time);
        flood = admission.flood;
        shown.push(admission.shown);
        notices.push(admission.notice);
    }
    return { flood, shown, notices };
}

function burst(author: string, count: number, time: number = 0): Array<readonly [string, number]> {
    return Array.from({ length: count }, () => [author, time] as const);
}

describe('admitChatMessage', () => {
    test('should show a quick conversation', () => {
        // Given: two players answering each other every second
        const messages = Array.from({ length: 20 }, (_, index: number) => [index % 2 === 0 ? 'alice' : 'bob', index * 1000] as const);

        // When / Then
        expect(admit(messages).shown.every(Boolean)).toEqual(true);
    });

    test('should hide the messages of an author over the rate, telling it once', () => {
        // When
        const { shown, notices, flood } = admit([...burst('bob', CHAT_RATE_LIMIT + 3), ['alice', 0]]);

        // Then
        expect(shown).toEqual([...Array<boolean>(CHAT_RATE_LIMIT).fill(true), false, false, false, true]);
        expect(notices).toEqual([...Array<boolean>(CHAT_RATE_LIMIT).fill(false), true, false, false, false]);
        expect(flood.flooding).toEqual(new Set(['bob']));
    });

    test('should count the messages within the window of the chain only', () => {
        // Given
        const before = burst('bob', CHAT_RATE_LIMIT);

        // When / Then
        expect(admit([...before, ['bob', CHAT_RATE_WINDOW - 1]]).shown.at(-1)).toEqual(false);
        expect(admit([...before, ['bob', CHAT_RATE_WINDOW]]).shown.at(-1)).toEqual(true);
    });

    test('should keep a flood hidden until it stops, then tell it again', () => {
        // Given: a message a second, the hidden ones counted
        const flood: Array<readonly [string, number]> = Array.from({ length: 30 }, (_, index: number) => ['bob', index * 1000] as const);

        // When
        const { shown, notices } = admit([...burst('bob', CHAT_RATE_LIMIT), ...flood, ['bob', 40_000], ...burst('bob', CHAT_RATE_LIMIT, 40_000)]);

        // Then: shown again once the rate falls back, a new flood noticed again
        expect(shown.slice(CHAT_RATE_LIMIT, CHAT_RATE_LIMIT + 30).some(Boolean)).toEqual(false);
        expect(shown.at(-CHAT_RATE_LIMIT - 1)).toEqual(true);
        expect(shown.at(-1)).toEqual(false);
        expect(notices.filter(Boolean)).toHaveLength(2);
    });

    test('should keep as many times as the limit at most', () => {
        // When
        const { flood } = admit(burst('bob', 3 * CHAT_RATE_LIMIT));

        // Then
        expect(flood.times.get('bob')).toHaveLength(CHAT_RATE_LIMIT);
    });
});
