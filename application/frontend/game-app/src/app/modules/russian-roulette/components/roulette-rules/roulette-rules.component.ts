import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/** The rules of the 24-shot Russian roulette */
@Component({
    selector: 'app-roulette-rules',
    templateUrl: './roulette-rules.component.html',
    imports: [TranslocoDirective],
    host: {
        class: 'block max-w-[860px] mx-auto px-4 leading-[1.6] text-app-text',
    },
})
export class RouletteRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);
}
