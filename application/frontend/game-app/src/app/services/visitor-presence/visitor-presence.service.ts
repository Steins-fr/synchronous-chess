import { DestroyRef, DOCUMENT, inject, Injectable, Signal, signal } from '@angular/core';

/**
 * Whether a person is on the page, not a bot rendering it (a crawler running JavaScript): the pages reach the APIs once
 * one is, the paused database woken by people only. Created as the app starts (app.config.ts), once a person is seen it
 * stays seen, through the navigations of the app. A person:
 * - acted on the page while its code loaded, before the app listens: a click or a key activated the document (sticky
 *   activation);
 * - reloaded the page, or came back to it through the history: a bot only loads a page, and a reload loses the
 *   activation;
 * - or acts on the page: a gesture, a click included (the button of a screen reader sends a click only).
 *
 * Not the scroll: a page scrolled by its code scrolls too. Trusted gestures only: a script, a crawler for one, clicking a
 * button of the page wakes nothing
 */
@Injectable({
    providedIn: 'root',
})
export class VisitorPresenceService {
    /** What a person does on a page, a bot rendering it never does */
    private static readonly GESTURES: ReadonlyArray<keyof DocumentEventMap> = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel', 'click'];
    /** The navigations a person asks: a bot navigates to a page */
    private static readonly PERSON_NAVIGATIONS: ReadonlyArray<NavigationTimingType> = ['reload', 'back_forward'];

    private readonly document = inject(DOCUMENT);
    private readonly window: Window = this.document.defaultView as Window;
    private readonly isPresent = signal<boolean>(this.activated() || this.navigatedByPerson());

    public readonly present: Signal<boolean> = this.isPresent.asReadonly();

    public constructor() {
        if (this.isPresent()) {
            return;
        }

        // Captured: seen before an element of the page stops it, or acts on it. Trusted only: a script, a crawler for
        // one, dispatches untrusted events
        const onGesture = (event: Event): void => {
            if (event.isTrusted) {
                this.isPresent.set(true);
                stopListening();
            }
        };
        const stopListening = (): void => VisitorPresenceService.GESTURES.forEach((type: keyof DocumentEventMap) => this.document.removeEventListener(type, onGesture, { capture: true }));
        VisitorPresenceService.GESTURES.forEach((type: keyof DocumentEventMap) => this.document.addEventListener(type, onGesture, { capture: true, passive: true }));
        inject(DestroyRef).onDestroy(stopListening);
    }

    // A gesture made before the app listens: read once, as the app starts. Unknown to a browser without the API: a gesture
    // tells it then
    private activated(): boolean {
        const activation: UserActivation | undefined = this.window.navigator.userActivation;
        return activation?.hasBeenActive === true;
    }

    private navigatedByPerson(): boolean {
        const [navigation]: PerformanceEntryList = this.window.performance.getEntriesByType('navigation');
        return navigation !== undefined && VisitorPresenceService.PERSON_NAVIGATIONS.includes((navigation as PerformanceNavigationTiming).type);
    }
}
