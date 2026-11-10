import { Component, ElementRef, inject, input, output, Signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { Side } from '../../classes/rules/fixed-roulette-rules';

/**
 * A seat of the table: its player, its part in the game in progress, croupier or punter, and its chips off the table,
 * in a stack and counted. The seat the game waits for is outlined, with the time left to its player
 */
@Component({
    selector: 'app-fixed-seat',
    templateUrl: './fixed-seat.component.html',
    imports: [ChipStackComponent, MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: {
        class: 'table-seat',
        '[class.outline-2]': 'awaited()',
        '[class.outline-app-accent-text]': 'awaited()',
    },
})
export class FixedSeatComponent {
    /** Its player, null for a free seat */
    public readonly name = input.required<string | null>();
    /** The game waits for its player */
    public readonly awaited = input<boolean>(false);
    /** The part of its player in the game in progress */
    public readonly side = input<Side | null>(null);
    /** The chips its player holds off the table: none out of a match */
    public readonly chips = input<number | null>(null);
    /** The time left to its player */
    public readonly clock = input<TranslatableText | null>(null);
    public readonly clockLow = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly canRelease = input<boolean>(false);
    public readonly take = output<void>();
    public readonly leave = output<void>();
    public readonly release = output<void>();

    private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    private readonly stack: Signal<ChipStackComponent | undefined> = viewChild('stack');

    /** Where the chips of its player lie: the chips bet fly from there, the chips won to there, to the seat itself out of a match */
    public chipsPlace(): HTMLElement {
        return this.stack()?.element ?? this.host;
    }
}
