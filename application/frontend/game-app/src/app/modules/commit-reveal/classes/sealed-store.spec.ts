import { SealedStore } from './sealed-store';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { TestHelper } from '@testing/test.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

interface Sealed {
    value: string;
    salt: string;
}

const value0: Sealed = { value: 'a', salt: 'salt0' };
const value1: Sealed = { value: 'b', salt: 'salt1' };

describe('SealedStore', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should keep the values of a player in a room across the pages of the tab', () => {
        // Given
        new SealedStore<Sealed>('turns', 'room', 'a').save(0, value0);
        new SealedStore<Sealed>('turns', 'room', 'a').save('lot', value1);

        // When
        const store = new SealedStore<Sealed>('turns', 'room', 'a');

        // Then
        expect(store.get(0)).toEqual(value0);
        expect(store.get('lot')).toEqual(value1);
        expect(new SealedStore<Sealed>('turns', 'room', 'b').get(0)).toBeUndefined();
        expect(new SealedStore<Sealed>('turns', 'other', 'a').get(0)).toBeUndefined();
        expect(new SealedStore<Sealed>('bids', 'room', 'a').get(0)).toBeUndefined();
    });

    test('should keep the values of a kind, a room and a player under one key of the session storage', () => {
        // When
        new SealedStore<Sealed>('turns', 'room', 'a').save(0, value0);

        // Then the turns of the chess keep the key of the pages of every version
        expect(JSON.parse(sessionStorage.getItem('synchronous-chess:sealed-turns:room:a') as string)).toEqual({ 0: value0 });
    });

    test('should remove a value once revealed', () => {
        // Given
        const store = new SealedStore<Sealed>('turns', 'room', 'a');
        store.save(0, value0);
        store.save(1, value1);
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

        // When
        store.remove(0);
        store.remove(0);

        // Then
        expect(store.get(0)).toBeUndefined();
        expect(store.get(1)).toEqual(value1);
        expect(setItemSpy).toHaveBeenCalledOnce();
    });

    test('should go on without the storage when it is blocked', () => {
        // Given
        const store = new SealedStore<Sealed>('turns', 'room', 'a', () => {
            throw new Error('blocked');
        });

        // When
        store.save(0, value0);

        // Then
        expect(store.get(0)).toBeUndefined();
        expect(TimedLogger.warn).toHaveBeenCalledWith('The committed actions can not be read, a reload can not reveal them', new Error('blocked'));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The committed actions can not be stored, a reload can not reveal them', new Error('blocked'));
    });

    test('should use the session storage of the browser by default', () => {
        expect(TestHelper.cast<{ storage(): Storage }>(new SealedStore<Sealed>('turns', 'room', 'a')).storage()).toBe(sessionStorage);
    });
});
