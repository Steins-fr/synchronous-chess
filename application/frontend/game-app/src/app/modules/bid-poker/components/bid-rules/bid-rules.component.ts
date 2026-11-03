import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** The rules of the Bid Poker */
@Component({
    selector: 'app-bid-rules',
    templateUrl: './bid-rules.component.html',
    imports: [TranslocoDirective],
    host: {
        class: 'block max-w-[860px] mx-auto px-4 leading-[1.6] text-app-text',
    },
})
export class BidRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);
}
