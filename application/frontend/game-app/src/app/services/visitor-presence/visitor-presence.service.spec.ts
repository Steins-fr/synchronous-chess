import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { VisitorPresenceService } from './visitor-presence.service';

describe('VisitorPresenceService', () => {
    const gestures: string[] = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'click'];

    function navigation(type?: string): void {
        // Missing from jsdom
        window.performance.getEntriesByType = vi.fn((): PerformanceEntryList => type === undefined ? [] : [{ type } as PerformanceNavigationTiming]);
    }

    function activation(hasBeenActive?: boolean): void {
        // Missing from jsdom, as from a browser without the API
        Object.defineProperty(window.navigator, 'userActivation', {
            configurable: true,
            value: hasBeenActive === undefined ? undefined : { hasBeenActive, isActive: false },
        });
    }

    /** The service itself: the specs provide a person on the page (test-providers.ts) */
    function createService(): VisitorPresenceService {
        TestBed.configureTestingModule({ providers: [VisitorPresenceService] });
        return TestBed.inject(VisitorPresenceService);
    }

    /**
     * Runs the listener of a gesture of the service with an event of a person (trusted), or of a script: jsdom trusts no
     * event the code dispatches, and never lets a spec trust one
     */
    function act(type: string, isTrusted: boolean = true): void {
        const call = vi.mocked(document.addEventListener).mock.calls.find(([listened]: Parameters<Document['addEventListener']>) => listened === type);
        (call?.[1] as (event: Event) => void)({ isTrusted } as Event);
    }

    beforeEach(() => {
        navigation('navigate');
        activation();
    });

    afterEach(() => {
        // @ts-expect-error The API of the specs only, missing from jsdom
        delete window.performance.getEntriesByType;
        // @ts-expect-error Removed from jsdom again
        delete window.navigator.userActivation;
        vi.restoreAllMocks();
    });

    test('should not see a person on a page only loaded, as by a bot', () => {
        expect(createService().present()).toBe(false);
    });

    test('should not see a person on a page without navigation entry', () => {
        // Given
        navigation();

        // When / Then
        expect(createService().present()).toBe(false);
    });

    test('should not see a person on a page loaded without its document activated', () => {
        // Given
        activation(false);

        // When / Then
        expect(createService().present()).toBe(false);
    });

    test('should see a person who acted on the page while its code loaded, before the app listens', () => {
        // Given
        activation(true);

        // When / Then
        expect(createService().present()).toBe(true);
    });

    test.each(['reload', 'back_forward'])('should see a person on a page opened by a %s navigation', (type: string) => {
        // Given
        navigation(type);

        // When / Then
        expect(createService().present()).toBe(true);
    });

    test('should listen for the gestures of a person, not the scroll, before an element of the page stops them', () => {
        // Given
        const added = vi.spyOn(document, 'addEventListener');

        // When
        createService();

        // Then: a page scrolls by its code too. Captured, a gesture reaches the document first
        expect(added.mock.calls.map(([type]: Parameters<Document['addEventListener']>) => type)).toEqual(gestures);
        gestures.forEach((gesture: string) => expect(added).toHaveBeenCalledWith(gesture, expect.any(Function), { capture: true, passive: true }));
    });

    test.each([
        ['moving the pointer', 'pointermove'],
        ['pressing the pointer', 'pointerdown'],
        ['pressing a key', 'keydown'],
        ['touching the screen', 'touchstart'],
        ['turning the wheel', 'wheel'],
        ['clicking, as the button of a screen reader does alone', 'click'],
    ])('should see a person %s on the page', (_case: string, gesture: string) => {
        // Given
        vi.spyOn(document, 'addEventListener');
        const service: VisitorPresenceService = createService();

        // When
        act(gesture);

        // Then
        expect(service.present()).toBe(true);
    });

    test('should not see a person in a gesture dispatched by a script: a crawler, a script of the page', () => {
        // Given
        vi.spyOn(document, 'addEventListener');
        const service: VisitorPresenceService = createService();

        // When
        document.body.dispatchEvent(new Event('pointermove', { bubbles: true }));
        act('keydown', false);
        act('click', false);

        // Then
        expect(service.present()).toBe(false);
    });

    test('should stop listening once it sees a person', () => {
        // Given
        vi.spyOn(document, 'addEventListener');
        const removed = vi.spyOn(document, 'removeEventListener');
        createService();

        // When
        act('pointermove');

        // Then
        gestures.forEach((gesture: string) => expect(removed).toHaveBeenCalledWith(gesture, expect.any(Function), { capture: true }));
    });

    test('should stop listening once destroyed', () => {
        // Given
        const removed = vi.spyOn(document, 'removeEventListener');
        createService();

        // When
        TestBed.resetTestingModule();

        // Then
        gestures.forEach((gesture: string) => expect(removed).toHaveBeenCalledWith(gesture, expect.any(Function), { capture: true }));
    });

    test('should not listen while a person is on the page', () => {
        // Given
        activation(true);
        const added = vi.spyOn(document, 'addEventListener');

        // When
        createService();

        // Then
        expect(added).not.toHaveBeenCalled();
    });
});
