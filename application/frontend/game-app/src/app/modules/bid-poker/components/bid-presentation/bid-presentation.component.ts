import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** Presents the game before joining a room */
@Component({
    selector: 'app-bid-presentation',
    templateUrl: './bid-presentation.component.html',
    imports: [TranslocoDirective],
})
export class BidPresentationComponent {}
