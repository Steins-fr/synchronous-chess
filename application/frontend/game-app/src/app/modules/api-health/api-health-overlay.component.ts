import { Component, inject, Signal } from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiHealthState } from '@app/services/api-health/api-health-state.enum';
import { ApiHealthService } from '@app/services/api-health/api-health.service';

/** Over the whole app while a page waits for the APIs to be up: it connects, then tells they boot when long */
@Component({
    selector: 'app-api-health-overlay',
    templateUrl: './api-health-overlay.component.html',
    imports: [MatProgressSpinner, TranslocoDirective],
})
export class ApiHealthOverlayComponent {
    protected readonly ApiHealthState = ApiHealthState;
    protected readonly state: Signal<ApiHealthState> = inject(ApiHealthService).state;
}
