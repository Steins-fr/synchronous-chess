import { computed, DestroyRef, DOCUMENT, effect, inject, Injectable, Signal, signal } from '@angular/core';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { DialogService } from '@app/services/dialog/dialog.service';

/**
 * Warns the player of a page before it leaves the match it plays, the other player waiting for it: the browser asks to
 * confirm the unload of the page (a close, a reload, a link out of the app), with a text of its own, and a navigation of
 * the app, or the button of the room leaving it, asks through a dialog (confirmLeave()). A spectator, or a match over, is
 * not warned. Provided by the page, given its match by the component of the game (watch())
 */
@Injectable()
export class MatchLeaveWarning {
    private readonly dialogService = inject(DialogService);
    private readonly match = signal<Signal<boolean> | undefined>(undefined);
    /** The local player plays the match of the page */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.match()?.() ?? false);

    public constructor() {
        // The window of the document, a browser one
        const window: Window = inject(DOCUMENT).defaultView as Window;
        // Listened during a match only: a page listening to its unload may be kept out of the back and forward cache
        effect((onCleanup: (cleanup: () => void) => void): void => {
            if (!this.inMatch()) {
                return;
            }

            window.addEventListener('beforeunload', MatchLeaveWarning.warn);
            onCleanup(() => window.removeEventListener('beforeunload', MatchLeaveWarning.warn));
        });
    }

    /**
     * Leaving the match the local player plays asks it to confirm: its seat then follows the one of a closed tab, freed once
     * the player is away. Out of a match, nothing to confirm
     * @returns whether the player leaves
     */
    public confirmLeave(): boolean | Promise<boolean> {
        return !this.inMatch() || this.dialogService.confirm(marker('rooms.leave.title'), marker('rooms.leave.message'), 'confirm-cancel');
    }

    /** The browser asks to confirm the unload of the page */
    private static warn(this: void, event: BeforeUnloadEvent): void {
        event.preventDefault();
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
