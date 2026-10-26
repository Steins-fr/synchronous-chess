import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SecretStore } from './secret-store';

interface Secrets {
    key: string;
    order: ReadonlyArray<number>;
}

const secrets: Secrets = { key: 'a1', order: [1, 0] };

describe('SecretStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should keep the secrets of a player for each game of a room across the pages of the tab', () => {
        // Given
        new SecretStore<Secrets>('deck', 'room', 'a').save('game:1', secrets);

        // When
        const store: SecretStore<Secrets> = new SecretStore<Secrets>('deck', 'room', 'a');

        // Then
        expect(store.get('game:1')).toEqual(secrets);
        expect(sessionStorage.getItem('synchronous-chess:deck-keys:room:a:game:1')).toEqual(JSON.stringify(secrets));
        expect(store.get('game:2')).toBeUndefined();
        expect(new SecretStore<Secrets>('deck', 'room', 'b').get('game:1')).toBeUndefined();
        expect(new SecretStore<Secrets>('deck', 'other', 'a').get('game:1')).toBeUndefined();
        expect(new SecretStore<Secrets>('cylinder', 'room', 'a').get('game:1')).toBeUndefined();
    });

    test('should remove the secrets of a game', () => {
        // Given
        const store: SecretStore<Secrets> = new SecretStore<Secrets>('deck', 'room', 'a');
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
        const store: SecretStore<Secrets> = new SecretStore<Secrets>('cylinder', 'room', 'a', () => {
            throw new Error('blocked');
        });

        // When
        store.save('game:1', secrets);
        store.remove('game:1');

        // Then
        expect(store.get('game:1')).toBeUndefined();
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the cylinder can not be read: a reload loses them', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the cylinder can not be stored: a reload loses them', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the cylinder can not be removed', new Error('blocked'));
    });

    test('should use the session storage of the browser by default', () => {
        expect(TestHelper.cast<{ storage(): Storage }>(new SecretStore<Secrets>('deck', 'room', 'a')).storage()).toBe(sessionStorage);
    });
});
