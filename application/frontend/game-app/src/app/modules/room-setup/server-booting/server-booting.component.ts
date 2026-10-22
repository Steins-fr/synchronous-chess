import { Component, input, Signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { heldFor } from '@app/helpers/signal.helper';

/**
 * Tells the server boots once a request to the APIs waits long: the lambda starts, the paused database resumes. The first
 * request of a person on the page wakes it, a page never asking the APIs beforehand (VisitorPresenceService)
 */
@Component({
    selector: 'app-server-booting',
    templateUrl: './server-booting.component.html',
    imports: [TranslocoDirective],
    // Its output only in the layout of its parent
    host: {
        class: 'contents',
    },
})
export class ServerBootingComponent {
    /** How long a request waits before the server is told booting, in milliseconds */
    public static readonly DELAY: number = 3000;

    /** A request to the APIs is awaited */
    public readonly waiting = input.required<boolean>();

    protected readonly shown: Signal<boolean> = heldFor(this.waiting, ServerBootingComponent.DELAY);
}
