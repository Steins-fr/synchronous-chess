import { Component, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CLOCK_LOW } from '@app/helpers/turn-clock.helper';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

/**
 * A seat of the table: its player, its coins and its cards, every player seeing the cards of the others. The seat the
 * game waits for is outlined; a sealed value of its player is told, never its amount
 */
@Component({
    selector: 'app-bid-seat',
    templateUrl: './bid-seat.component.html',
    imports: [CardHandComponent, ChipStackComponent, MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'table-seat flex-col items-stretch',
        '[id]': '"seat-" + seat()',
        '[class.outline-2]': 'awaited()',
        '[class.outline-app-accent-text]': 'awaited()',
    },
})
export class BidSeatComponent {
    public readonly seat = input.required<number>();
    /** Its player, null for a free seat */
    public readonly name = input.required<string | null>();
    /** The coins of its player, none before the game */
    public readonly coins = input<number | null>(null);
    public readonly cards = input<ReadonlyArray<Readonly<HandCard>>>([]);
    /** The game waits for its player */
    public readonly awaited = input<boolean>(false);
    /** Its player sealed its value of the phase */
    public readonly sealed = input<boolean>(false);
    /** Its player let a phase close without acting: the game goes on without waiting for it */
    public readonly absent = input<boolean>(false);
    /** The seconds left to its player */
    public readonly timeLeft = input<number | null>(null);
    /** The end of the game for its player */
    public readonly standing = input<TranslatableText | null>(null);
    /** Its player won a prize: the standing of the others shows in the neutral colors */
    public readonly winning = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly canRelease = input<boolean>(false);
    /** The player picks the cards to discard */
    public readonly selectable = input<boolean>(false);
    public readonly selected = model<ReadonlyArray<string>>([]);
    public readonly highlighted = input<ReadonlyArray<string>>([]);
    public readonly take = output<void>();
    public readonly leave = output<void>();
    public readonly release = output<void>();

    protected readonly clockLow: number = CLOCK_LOW;
}
