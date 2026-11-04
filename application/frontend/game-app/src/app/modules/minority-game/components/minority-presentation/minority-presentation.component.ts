import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** Presents the game before joining a room */
@Component({
    selector: 'app-minority-presentation',
    templateUrl: './minority-presentation.component.html',
    imports: [TranslocoDirective],
})
export class MinorityPresentationComponent {}
