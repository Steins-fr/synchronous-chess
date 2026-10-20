import { Component, computed, inject, Signal } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { heldFor, LOADER_DELAY } from '@app/helpers/signal.helper';

/**
 * Over the whole app while a navigation loads the next page, its code and its translations: a click on a link never
 * looks ignored. A quick navigation shows nothing (LOADER_DELAY), the previous page staying until the next one shows
 */
@Component({
    selector: 'app-page-loader',
    templateUrl: './page-loader.component.html',
    imports: [MatProgressSpinner, TranslocoDirective],
})
export class PageLoaderComponent {
    private readonly router = inject(Router);
    private readonly navigating: Signal<boolean> = computed(() => this.router.currentNavigation() !== null);

    protected readonly visible: Signal<boolean> = heldFor(this.navigating, LOADER_DELAY);
}
