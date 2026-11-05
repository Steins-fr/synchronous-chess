import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** The rules of the Contraband, in its two variants */
@Component({
    selector: 'app-contraband-rules',
    templateUrl: './contraband-rules.component.html',
    imports: [TranslocoDirective],
    host: {
        class: 'block max-w-[860px] mx-auto px-4 leading-[1.6] text-app-text',
    },
})
export class ContrabandRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);
}
