import { Component, computed, inject, linkedSignal, Signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiHealthState } from '@app/services/api-health/api-health-state.enum';
import { ApiHealthService } from '@app/services/api-health/api-health.service';
import { map, of, switchMap, timer } from 'rxjs';

/**
 * Over the whole app while a page waits for the APIs to be up: it connects, then tells they boot when long. It stays until
 * the page shows, the APIs up, while the rest of its navigation loads (its translations, its code): the previous page
 * never shows again meanwhile. A quick wait shows nothing, the previous page staying until the next one shows
 */
@Component({
    selector: 'app-api-health-overlay',
    templateUrl: './api-health-overlay.component.html',
    imports: [MatProgressSpinner, TranslocoDirective],
})
export class ApiHealthOverlayComponent {
    /** How long a page waits before the overlay shows, in milliseconds */
    public static readonly SHOW_DELAY: number = 400;

    protected readonly ApiHealthState = ApiHealthState;
    protected readonly state: Signal<ApiHealthState> = inject(ApiHealthService).state;
    private readonly router = inject(Router);
    private readonly navigating: Signal<boolean> = computed(() => this.router.currentNavigation() !== null);

    // The check of the APIs, then the end of the navigation waiting for it
    private readonly waiting: Signal<boolean> = linkedSignal<{ state: ApiHealthState; navigating: boolean }, boolean>({
        source: () => ({ state: this.state(), navigating: this.navigating() }),
        computation: ({ state, navigating }, previous): boolean => state !== ApiHealthState.IDLE || (navigating && previous?.value === true),
    });

    protected readonly visible: Signal<boolean> = toSignal(toObservable(this.waiting).pipe(
        switchMap((waiting: boolean) => waiting ? timer(ApiHealthOverlayComponent.SHOW_DELAY).pipe(map((): boolean => true)) : of(false)),
    ), { initialValue: false });
}
