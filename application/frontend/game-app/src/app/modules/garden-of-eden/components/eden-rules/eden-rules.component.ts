import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** The rules of the Garden of Eden, its table of gains included */
@Component({
    selector: 'app-eden-rules',
    templateUrl: './eden-rules.component.html',
    imports: [TranslocoDirective],
    host: {
        class: 'block max-w-[860px] mx-auto px-4 leading-[1.6] text-app-text',
    },
})
export class EdenRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);
}
