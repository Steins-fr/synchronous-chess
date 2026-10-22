import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * A seat of the table: its player, its chips and its bet of the round, a ring around it while its player acts. The bet
 * slides in from the stack, then to the pot (--pot-direction: 1 when the pot is below the seat, -1 above it)
 */
@Component({
    selector: 'app-poker-seat',
    templateUrl: './poker-seat.component.html',
    styleUrl: './poker-seat.component.scss',
    imports: [MatButtonModule, TranslocoDirective],
    host: { class: 'block' },
})
export class PokerSeatComponent {
    /** The player of the seat, null for a free seat */
    public readonly name = input.required<string | null>();
    public readonly chips = input.required<number>();
    /** The chips the player put in the betting round in progress */
    public readonly bet = input<number>(0);
    /** Whether the table waits for the player of the seat */
    public readonly acting = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly take = output<void>();
    public readonly leave = output<void>();
}
