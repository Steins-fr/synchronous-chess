import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { KeptSecrets } from './kept-secrets';
import { SecretStore } from './secret-store';

interface Stored {
    key: string;
}

const LOST: string = 'The keys of the game are lost';

describe('KeptSecrets', () => {
    let store: SecretStore<Stored>;
    let onLost: () => void;

    /** The secrets of the game, as numbers: a storage that is not the one of the game throws */
    function kept(options: { readonly onLost?: () => void } = {}): KeptSecrets<Stored, bigint> {
        return new KeptSecrets<Stored, bigint>({ store, id: 'game:1', parse: ({ key }) => BigInt(`0x${ key }`), lostWarning: LOST, ...options });
    }

    beforeEach(() => {
        sessionStorage.clear();
        store = new SecretStore<Stored>('game', 'room', 'alice');
        onLost = vi.fn();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should draw the secrets when none is stored, and store them before they are used', () => {
        // Given
        const secrets = kept();

        // When
        const loaded: bigint | undefined = secrets.load(() => ({ key: 'ff' }));

        // Then
        expect(loaded).toEqual(255n);
        expect(store.get('game:1')).toEqual({ key: 'ff' });
        // Kept by the page: the storage is read once
        store.save('game:1', { key: '01' });
        expect(secrets.load()).toEqual(255n);
    });

    test('should read the secrets a former page stored', () => {
        // Given
        store.save('game:1', { key: '0a' });

        // When
        const loaded: bigint | undefined = kept().load(() => ({ key: 'ff' }));

        // Then
        expect(loaded).toEqual(10n);
    });

    test.each([
        ['none is stored, nor drawn', undefined],
        ['the storage is not the one of the game', { key: 'not hexadecimal' }],
    ])('should lose the secrets once, as %s', (_: string, stored: Stored | undefined) => {
        // Given
        if (stored) {
            store.save('game:1', stored);
        }
        const secrets = kept({ onLost });

        // When
        const loaded: bigint | undefined = secrets.load();
        store.save('game:1', { key: '0a' });

        // Then: lost, they are not looked for again
        expect(loaded).toBeUndefined();
        expect(secrets.load()).toBeUndefined();
        expect(secrets.lost()).toBe(true);
        expect(onLost).toHaveBeenCalledOnce();
        expect(TimedLogger.warn).toHaveBeenCalledExactlyOnceWith(LOST);
    });

    test('should keep the new secrets of the player, found again once lost', () => {
        // Given
        const secrets = kept();
        secrets.load();

        // When
        secrets.keep({ key: '0b' }, 11n);

        // Then
        expect(secrets.lost()).toBe(false);
        expect(secrets.load()).toEqual(11n);
        expect(store.get('game:1')).toEqual({ key: '0b' });
    });

    test('should drop the secrets that are not the ones of the chain', () => {
        // Given
        store.save('game:1', { key: '0a' });
        const secrets = kept({ onLost });
        secrets.load();

        // When
        secrets.drop();

        // Then
        expect(secrets.load()).toBeUndefined();
        expect(secrets.lost()).toBe(true);
        expect(store.get('game:1')).toBeUndefined();
        expect(onLost).toHaveBeenCalledOnce();
    });
});
