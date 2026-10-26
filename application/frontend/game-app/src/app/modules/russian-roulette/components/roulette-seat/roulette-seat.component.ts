import { Component, computed, ElementRef, inject, input, output, Signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CLOCK_LOW } from '@app/helpers/turn-clock.helper';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

/** The chamber the player of a seat fired, once the revolver fired it */
export enum SeatShot {
    /** A bullet: the player dies */
    DEATH = 'death',
    /** An empty chamber: the player survives */
    EMPTY = 'empty',
}

/**
 * A seat of the table: its player, its chips and its deaths, a ring around it and the clock of its move while the game
 * waits for its player
 */
@Component({
    selector: 'app-roulette-seat',
    templateUrl: './roulette-seat.component.html',
    styleUrl: './roulette-seat.component.scss',
    imports: [ChipStackComponent, MatButtonModule, TranslocoDirective, TranslocoPipe],
    host: { class: 'block' },
})
export class RouletteSeatComponent {
    /** The player of the seat, null for a free seat */
    public readonly name = input.required<string | null>();
    public readonly chips = input.required<number>();
    /** The chambers fired with a bullet on the player */
    public readonly deaths = input<number>(0);
    /** Whether the table waits for the player of the seat */
    public readonly acting = input<boolean>(false);
    /** The seconds left to the player of the seat for its move, null out of its turn */
    public readonly timeLeft = input<number | null>(null);
    /** The seconds of a move */
    public readonly turnTime = input.required<number>();
    public readonly canTake = input<boolean>(false);
    public readonly canLeave = input<boolean>(false);
    /** Whether the local player may free the seat of the other one, away */
    public readonly canRelease = input<boolean>(false);
    /** The chips of the pass the player just made, stamped on the seat until its animation ends */
    public readonly passed = input<number | null>(null);
    /** The chamber the player fired, once the revolver fires: its seat shakes on a death, glows when it survives */
    public readonly shot = input<SeatShot | null>(null);
    public readonly take = output<void>();
    /** The stamp of the pass faded out */
    public readonly stamped = output<void>();
    public readonly leave = output<void>();
    public readonly release = output<void>();

    protected readonly clockLow: number = CLOCK_LOW;
    protected readonly death: SeatShot = SeatShot.DEATH;
    protected readonly survived: SeatShot = SeatShot.EMPTY;
    /** The part of the time of a move left, in percent: full while a player away gave the move more */
    protected readonly clockFill: Signal<number> = computed((): number => Math.min(1, (this.timeLeft() as number) / this.turnTime()) * 100);
    private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
    private readonly stack: Signal<ChipStackComponent | undefined> = viewChild('stack');
    private readonly nameView: Signal<ElementRef<HTMLElement>> = viewChild.required('nameView');

    /** Where the chips of the seat lie: its stack, the seat itself while free */
    public chipsPlace(): HTMLElement {
        return this.stack()?.element ?? this.host.nativeElement;
    }

    /** The name of the player, the revolver aiming at it */
    public namePlace(): HTMLElement {
        return this.nameView().nativeElement;
    }

    /** The seat itself, the revolver aiming from the cloth next to it */
    public seatPlace(): HTMLElement {
        return this.host.nativeElement;
    }

    /** The stamp of the pass ends with its own animation, not the ones inside it */
    protected endStamp(event: AnimationEvent): void {
        if (event.target === event.currentTarget) {
            this.stamped.emit();
        }
    }
}
