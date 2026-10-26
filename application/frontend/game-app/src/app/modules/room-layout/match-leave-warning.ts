import { computed, DestroyRef, DOCUMENT, inject, Injectable, Signal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';

/**
 * Warns the player of a page before it leaves the match it plays, the other player waiting for it: the browser asks to
 * confirm the unload of the page (a close, a reload, a link out of the app), with a text of its own, and a navigation of
 * the app asks through a dialog (leaveMatchGuard). A spectator, or a match over, is not warned. Provided by the page,
 * given its match by the component of the game (watch())
 */
@Injectable()
export class MatchLeaveWarning {
    private readonly match = signal<Signal<boolean> | undefined>(undefined);
    /** The local player plays the match of the page */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.match()?.() ?? false);

    public constructor() {
        // The window of the document, a browser one
        const window: Window = inject(DOCUMENT).defaultView as Window;
        fromEvent<BeforeUnloadEvent>(window, 'beforeunload').pipe(takeUntilDestroyed()).subscribe((event: BeforeUnloadEvent) => {
            if (this.inMatch()) {
                event.preventDefault();
            }
        });
    }

    /**
     * The match of the page, to call in an injection context: watched until the component giving it is destroyed
     * @param inMatch whether the local player plays it
     * @returns the match watched
     */
    public watch(inMatch: Signal<boolean>): Signal<boolean> {
        this.match.set(inMatch);
        inject(DestroyRef).onDestroy(() => {
            if (this.match() === inMatch) {
                this.match.set(undefined);
            }
        });
        return inMatch;
    }
}
