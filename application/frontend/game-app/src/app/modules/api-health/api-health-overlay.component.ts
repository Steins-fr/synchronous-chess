import { Component, computed, inject, linkedSignal, Signal } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiHealthState } from '@app/services/api-health/api-health-state.enum';
import { ApiHealthService } from '@app/services/api-health/api-health.service';

/**
 * Over the whole app while a page waits for the APIs to be up: it connects, then tells they boot when long. It stays until
 * the page shows, the APIs up, while the rest of its navigation loads (its translations, its code): the previous page
 * never shows again meanwhile
 */
@Component({
    selector: 'app-api-health-overlay',
    templateUrl: './api-health-overlay.component.html',
    imports: [MatProgressSpinner, TranslocoDirective],
})
export class ApiHealthOverlayComponent {
    protected readonly ApiHealthState = ApiHealthState;
    protected readonly state: Signal<ApiHealthState> = inject(ApiHealthService).state;
    private readonly router = inject(Router);
    private readonly navigating: Signal<boolean> = computed(() => this.router.currentNavigation() !== null);

    // Shown by the check of the APIs, then kept until the end of the navigation waiting for it
    protected readonly visible: Signal<boolean> = linkedSignal<{ state: ApiHealthState; navigating: boolean }, boolean>({
        source: () => ({ state: this.state(), navigating: this.navigating() }),
        computation: ({ state, navigating }, previous): boolean => state !== ApiHealthState.IDLE || (navigating && previous?.value === true),
    });
}
