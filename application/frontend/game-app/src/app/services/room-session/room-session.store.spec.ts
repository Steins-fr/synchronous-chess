import { TestBed } from '@angular/core/testing';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RoomSessionStore } from './room-session.store';

describe('RoomSessionStore', () => {
    let store: RoomSessionStore;

    beforeEach(() => {
        sessionStorage.clear();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        store = TestBed.inject(RoomSessionStore);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
    });

    test('should keep the session of each room in the tab', () => {
        // When
        store.save('room#000001', { playerName: 'alice', token: 'a1' });
        store.save('room#000002', { playerName: 'bob', token: 'b2' });

        // Then
        expect(store.get('room#000001')).toEqual({ playerName: 'alice', token: 'a1' });
        expect(store.get('room#000002')).toEqual({ playerName: 'bob', token: 'b2' });
        expect(store.get('room#000003')).toBeUndefined();
        expect(sessionStorage.getItem('synchronous-chess:room-session:room#000001')).toBe(JSON.stringify({ playerName: 'alice', token: 'a1' }));
    });

    test('should remove the session of a room', () => {
        // Given
        store.save('room#000001', { playerName: 'alice', token: 'a1' });
        store.save('room#000002', { playerName: 'bob', token: 'b2' });

        // When
        store.remove('room#000001');

        // Then
        expect(store.get('room#000001')).toBeUndefined();
        expect(store.get('room#000002')).toEqual({ playerName: 'bob', token: 'b2' });
    });

    test.each<[string, string]>([
        ['not json', '{'],
        ['null', 'null'],
        ['without token', JSON.stringify({ playerName: 'alice' })],
        ['an empty name', JSON.stringify({ playerName: '', token: 'a1' })],
        ['an empty token', JSON.stringify({ playerName: 'alice', token: '' })],
        ['a name not a text', JSON.stringify({ playerName: 1, token: 'a1' })],
    ])('should read no session from a value %s', (_case: string, stored: string) => {
        // Given
        sessionStorage.setItem('synchronous-chess:room-session:room#000001', stored);

        // When, Then
        expect(store.get('room#000001')).toBeUndefined();
    });

    test('should neither read, store nor remove, without failing, when the storage is blocked', () => {
        // Given
        const blocked = (): never => {
            throw new DOMException('Blocked', 'SecurityError');
        };
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);

        // When
        store.save('room#000001', { playerName: 'alice', token: 'a1' });
        store.remove('room#000001');

        // Then
        expect(store.get('room#000001')).toBeUndefined();
        expect(TimedLogger.warn).toHaveBeenCalledTimes(3);
    });
});
