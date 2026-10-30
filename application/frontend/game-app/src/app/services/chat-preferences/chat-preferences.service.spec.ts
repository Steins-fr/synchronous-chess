import { TestBed } from '@angular/core/testing';
import { ChatPreferencesService } from './chat-preferences.service';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('ChatPreferencesService', () => {
    function createService(): ChatPreferencesService {
        return TestBed.inject(ChatPreferencesService);
    }

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    test('should turn every setting on by default, with a fine pointer', () => {
        // When
        const service: ChatPreferencesService = createService();

        // Then
        expect(service.panelOpen.on()).toEqual(true);
        expect(service.arrivals.on()).toEqual(true);
        expect(service.times.on()).toEqual(true);
        expect(service.enterSends.on()).toEqual(true);
        expect(service.hideOffensiveWords.on()).toEqual(true);
    });

    test('should not send with Enter by default on a touch screen', () => {
        // Given
        vi.spyOn(globalThis, 'matchMedia').mockImplementation((query: string) =>
            ({ matches: query === ChatPreferencesService.coarsePointerQuery, media: query }) as MediaQueryList);

        // When
        const service: ChatPreferencesService = createService();

        // Then
        expect(service.enterSends.on()).toEqual(false);
    });

    test('should read the settings picked before, an unknown value keeping the default', () => {
        // Given
        localStorage.setItem(ChatPreferencesService.panelKey, 'off');
        localStorage.setItem(ChatPreferencesService.arrivalsKey, 'off');
        localStorage.setItem(ChatPreferencesService.timesKey, 'on');
        localStorage.setItem(ChatPreferencesService.enterSendsKey, 'unknown');
        localStorage.setItem(ChatPreferencesService.hideOffensiveWordsKey, 'off');

        // When
        const service: ChatPreferencesService = createService();

        // Then
        expect(service.panelOpen.on()).toEqual(false);
        expect(service.arrivals.on()).toEqual(false);
        expect(service.times.on()).toEqual(true);
        expect(service.enterSends.on()).toEqual(true);
        expect(service.hideOffensiveWords.on()).toEqual(false);
    });

    test('should keep a setting picked', () => {
        // Given
        const service: ChatPreferencesService = createService();

        // When
        service.times.set(false);

        // Then
        expect(service.times.on()).toEqual(false);
        expect(localStorage.getItem(ChatPreferencesService.timesKey)).toEqual('off');

        // When
        service.times.set(true);

        // Then
        expect(service.times.on()).toEqual(true);
        expect(localStorage.getItem(ChatPreferencesService.timesKey)).toEqual('on');

        // When
        service.hideOffensiveWords.set(false);

        // Then
        expect(service.hideOffensiveWords.on()).toEqual(false);
        expect(localStorage.getItem(ChatPreferencesService.hideOffensiveWordsKey)).toEqual('off');
    });

    test('should follow the settings another tab picked, and a cleared storage', () => {
        // Given
        const service: ChatPreferencesService = createService();

        // When
        localStorage.setItem(ChatPreferencesService.arrivalsKey, 'off');
        globalThis.dispatchEvent(new StorageEvent('storage', { key: ChatPreferencesService.arrivalsKey }));

        // Then
        expect(service.arrivals.on()).toEqual(false);

        // When
        localStorage.setItem(ChatPreferencesService.hideOffensiveWordsKey, 'off');
        globalThis.dispatchEvent(new StorageEvent('storage', { key: ChatPreferencesService.hideOffensiveWordsKey }));

        // Then
        expect(service.hideOffensiveWords.on()).toEqual(false);

        // When
        localStorage.clear();
        globalThis.dispatchEvent(new StorageEvent('storage', { key: null }));

        // Then
        expect(service.arrivals.on()).toEqual(true);
        expect(service.hideOffensiveWords.on()).toEqual(true);
    });
});
