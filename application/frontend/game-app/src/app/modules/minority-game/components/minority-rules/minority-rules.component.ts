import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** The rules of the Minority Game, in its two variants */
@Component({
    selector: 'app-minority-rules',
    templateUrl: './minority-rules.component.html',
    imports: [TranslocoDirective],
    host: {
        class: 'block max-w-[860px] mx-auto px-4 leading-[1.6] text-app-text',
    },
})
export class MinorityRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);
}
