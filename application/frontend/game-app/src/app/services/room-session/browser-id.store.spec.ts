import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BrowserIdStore } from './browser-id.store';

describe('BrowserIdStore', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should draw a random id of the browser once, kept in the local storage', () => {
        // When
        const id: string = TestBed.inject(BrowserIdStore).id();

        // Then
        expect(id).toMatch(/^[\da-f]{32}$/);
        expect(TestBed.inject(BrowserIdStore).id()).toBe(id);
        expect(localStorage.getItem('synchronous-chess:browser-id')).toBe(id);
    });

    test('should read the id another tab of the browser stored', () => {
        // Given
        localStorage.setItem('synchronous-chess:browser-id', 'stored-id');

        // When / Then
        expect(TestBed.inject(BrowserIdStore).id()).toBe('stored-id');
    });

    test('should keep the id it drew until the page leaves when the storage is blocked', () => {
        // Given
        const blocked = (): never => {
            throw new DOMException('Blocked', 'SecurityError');
        };
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
        const store: BrowserIdStore = TestBed.inject(BrowserIdStore);

        // When
        const id: string = store.id();

        // Then
        expect(id).toMatch(/^[\da-f]{32}$/);
        expect(store.id()).toBe(id);
    });
});
