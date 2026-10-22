import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DeckKeyStore, DeckSecrets } from './deck-key-store';

const secrets: DeckSecrets = { shuffleKey: 'a1', permutation: [1, 0], cardKeys: ['b2', 'c3'] };

describe('DeckKeyStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should keep the secrets of a player for each deck of a room across the pages of the tab', () => {
        // Given
        new DeckKeyStore('room', 'a').save('game:1', secrets);

        // When
        const store: DeckKeyStore = new DeckKeyStore('room', 'a');

        // Then
        expect(store.get('game:1')).toEqual(secrets);
        expect(store.get('game:2')).toBeUndefined();
        expect(new DeckKeyStore('room', 'b').get('game:1')).toBeUndefined();
        expect(new DeckKeyStore('other', 'a').get('game:1')).toBeUndefined();
    });

    test('should remove the secrets of a deck', () => {
        // Given
        const store: DeckKeyStore = new DeckKeyStore('room', 'a');
        store.save('game:1', secrets);
        store.save('game:2', secrets);

        // When
        store.remove('game:1');

        // Then
        expect(store.get('game:1')).toBeUndefined();
        expect(store.get('game:2')).toEqual(secrets);
    });

    test('should go on without the storage when it is blocked', () => {
        // Given
        const store: DeckKeyStore = new DeckKeyStore('room', 'a', () => {
            throw new Error('blocked');
        });

        // When
        store.save('game:1', secrets);
        store.remove('game:1');

        // Then
        expect(store.get('game:1')).toBeUndefined();
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the deck can not be read, a reload can not read its cards', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the deck can not be stored, a reload can not read its cards', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the deck can not be removed', new Error('blocked'));
    });

    test('should use the session storage of the browser by default', () => {
        expect(TestHelper.cast<{ storage(): Storage }>(new DeckKeyStore('room', 'a')).storage()).toBe(sessionStorage);
    });
});
