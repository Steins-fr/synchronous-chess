import { Component, input } from '@angular/core';
import { PlayingCardComponent } from '@app/modules/playing-cards/components/playing-card/playing-card.component';
import { TranslocoDirective } from '@jsverse/transloco';

/** The deck left on the table, face down with its count. While shuffled, its two halves riffle into each other */
@Component({
    selector: 'app-card-deck',
    templateUrl: './card-deck.component.html',
    styleUrl: './card-deck.component.scss',
    imports: [PlayingCardComponent, TranslocoDirective],
    host: { class: 'inline-block' },
})
export class CardDeckComponent {
    /** The cards of the deck */
    public readonly count = input.required<number>();
    public readonly shuffling = input<boolean>(false);
}
