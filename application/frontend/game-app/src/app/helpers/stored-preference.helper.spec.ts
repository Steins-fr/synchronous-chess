import { Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { storageChanges, storedValue, storeValue } from './stored-preference.helper';

describe('stored preference', () => {
    enum Color {
        RED = 'red',
        BLUE = 'blue',
    }

    const key: string = 'color';

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should read the value stored', () => {
        // When
        storeValue(window, key, Color.BLUE);

        // Then
        expect(storedValue(window, key, Color)).toBe(Color.BLUE);
    });

    test.each<[string, string | null]>([
        ['none', null],
        ['an unknown value', 'green'],
    ])('should read nothing when the storage holds %s', (_case: string, stored: string | null) => {
        // Given
        if (stored !== null) {
            localStorage.setItem(key, stored);
        }

        // When, Then
        expect(storedValue(window, key, Color)).toBeUndefined();
    });

    test('should neither read nor store, without failing, when the storage is blocked', () => {
        // Given
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });

        // When
        storeValue(window, key, Color.RED);

        // Then
        expect(setItem).toHaveBeenCalledOnce();
        expect(storedValue(window, key, Color)).toBeUndefined();
    });

    test('should tell the changes another tab made to the value, or to the whole storage', () => {
        // Given
        const changes: Array<string | null> = [];
        const subscription: Subscription = storageChanges(window, key).subscribe((event: StorageEvent) => changes.push(event.key));

        // When
        window.dispatchEvent(new StorageEvent('storage', { key }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
        subscription.unsubscribe();

        // Then
        expect(changes).toEqual([key, null]);
    });
});
