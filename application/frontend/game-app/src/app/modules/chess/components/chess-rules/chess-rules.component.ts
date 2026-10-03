import { Component, input } from '@angular/core';

/** The rules of the synchronous chess, from the source rules */
@Component({
    selector: 'app-chess-rules',
    templateUrl: './chess-rules.component.html',
    styleUrl: './chess-rules.component.scss',
})
export class ChessRulesComponent {
    /** Hidden when the rules are already titled, e.g. by a collapsible section */
    public readonly withTitle = input<boolean>(true);

    protected scrollTo(section: HTMLElement): void {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
