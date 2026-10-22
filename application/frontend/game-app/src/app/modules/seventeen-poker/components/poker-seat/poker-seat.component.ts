import { Component, ElementRef, inject, input, output, Signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslocoDirective } from '@jsverse/transloco';

/** A seat of the table: its player and its chips, a ring around it while its player acts, and what it won in the hand over */
@Component({
    selector: 'app-poker-seat',
    templateUrl: './poker-seat.component.html',
    styleUrl: './poker-seat.component.scss',
    imports: [ChipStackComponent, MatButtonModule, TranslocoDirective],
    host: { class: 'block' },
})
export class PokerSeatComponent {
    /** The player of the seat, null for a free seat */
    public readonly name = input.required<string | null>();
    public readonly chips = input.required<number>();
    /** The chips the player won in the hand over, none while a hand goes on */
    public readonly gain = input<number>(0);
    /** Whether the table waits for the player of the seat */
    public readonly acting = input<boolean>(false);
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    public readonly take = output<void>();
    public readonly leave = output<void>();

    private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
    private readonly stack: Signal<ChipStackComponent | undefined> = viewChild('stack');

    /** Where the chips of the seat lie: its stack, the seat itself while free */
    public chipsPlace(): HTMLElement {
        return this.stack()?.element ?? this.host.nativeElement;
    }
}
