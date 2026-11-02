import { Component, input } from '@angular/core';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoPipe } from '@jsverse/transloco';

/** A lot of the catalogue: its cards, who sells it, and what became of it */
@Component({
    selector: 'app-bid-lot',
    templateUrl: './bid-lot.component.html',
    imports: [CardHandComponent, TranslocoPipe],
    host: {
        class: 'flex flex-col gap-1 p-2 rounded-xl border border-app-border bg-app-surface-raised [--app-card-width:2.5rem]',
        '[class.outline-2]': 'current()',
        '[class.outline-app-accent-text]': 'current()',
    },
})
export class BidLotComponent {
    public readonly name = input.required<TranslatableText>();
    public readonly cards = input.required<ReadonlyArray<Readonly<HandCard>>>();
    /** The bank, or the player who discarded it */
    public readonly seller = input.required<TranslatableText>();
    /** What became of it, once auctioned */
    public readonly outcome = input<TranslatableText | null>(null);
    /** The lot auctioned */
    public readonly current = input<boolean>(false);
}
