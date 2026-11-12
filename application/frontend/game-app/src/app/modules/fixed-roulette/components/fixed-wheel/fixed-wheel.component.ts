import { Component, computed, ElementRef, inject, InjectionToken, input, output, signal, Signal } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { SeatPair } from '@app/helpers/seat-pair.helper';
import { ChoiceAreaComponent } from '@app/modules/form/choice-area/choice-area.component';
import { StakeFieldComponent } from '@app/modules/form/stake-field/stake-field.component';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';

/** The row of a stake in a pocket: the player of the top seat, or of the bottom one */
export enum StakeRow {
    TOP = 'top',
    BOTTOM = 'bottom',
}

/** Which ball the wheel shows */
export enum BallKind {
    /** The ball the local player, croupier, sealed: shown on its page only, until it is revealed */
    SEALED = 'sealed',
    /** The ball of the game settled last, until the croupier of the next game places its own */
    LAST = 'last',
}

/** The ball the wheel shows, in its pocket */
export interface ShownBall {
    /** Numbered from 1 */
    readonly pocket: number;
    readonly kind: BallKind;
}

/** A pocket of the wheel: the stakes of the top and the bottom players, and the ball when it lies there */
interface WheelPocket {
    readonly pocket: number;
    readonly red: boolean;
    readonly top: number;
    readonly bottom: number;
    readonly ball: BallKind | null;
    /** The classes laying its content in its quarter of the disk: against the hub, its number on the side of the rim */
    readonly layout: string;
    /** Whether the place of its ball lies above its stakes: the pockets of the first row */
    readonly rimFirst: boolean;
    /** The classes pushing its number from the rim to the middle of its quarter of the disk */
    readonly inset: string;
}

/** The time the ball revealed rolls from the hub to the rim of its pocket, in milliseconds: none for the specs */
export const BALL_ROLL = new InjectionToken<number>('BALL_ROLL', { factory: (): number => 2500 });

/** The pockets lie in reading order, two by row: where each one is around the hub, in degrees from the top, clockwise */
const POCKET_ANGLES: ReadonlyArray<number> = [315, 45, 225, 135];
/**
 * The content of a pocket lies against the hub, where its quarter of the disk is the widest: its stakes along the line
 * between the rows, the place the croupier clicks for its ball on the side of the rim
 */
const POCKET_LAYOUTS: ReadonlyArray<string> = ['items-end pr-[14%] pb-[9%]', 'items-start pl-[14%] pb-[9%]', 'items-end pr-[14%] pt-[9%]', 'items-start pl-[14%] pt-[9%]'];

/** The number of a pocket, printed in the middle of its quarter of the disk: pushed from the rim of its corner */
const NUMBER_INSETS: ReadonlyArray<string> = ['pt-[14%] pl-[14%]', 'pt-[14%] pr-[14%]', 'pb-[14%] pl-[14%]', 'pb-[14%] pr-[14%]'];

/** The pockets of a roulette are red and black by turns around the wheel, the first one red: the same colors face each other */
const isRed = (index: number): boolean => (Math.floor(index / 2) + index % 2) % 2 === 0;

/**
 * The fixed wheel of the roulette: a disk that never spins in its square, its four pockets in reading order around a
 * hub, red and black, each one its number printed in its middle, under the stake of the player of the top seat above the one of the bottom
 * seat. The local player types its stakes in the pockets, and the croupier places its ball by clicking the place of
 * the ball of one, beside its rim. The ball lies on the
 * rim of its pocket: the ball the local player sealed, on its page only, then the ball revealed, rolling there from the
 * hub, until the next game places its own. Each pocket tells its number, the ball and the stakes to a screen reader
 */
@Component({
    selector: 'app-fixed-wheel',
    templateUrl: './fixed-wheel.component.html',
    styleUrl: './fixed-wheel.component.scss',
    imports: [ChipStackComponent, ChoiceAreaComponent, StakeFieldComponent, TranslocoDirective, TranslocoPipe],
    host: { 'class': 'flex flex-col items-center gap-2', '[style.--ball-roll.ms]': 'roll' },
})
export class FixedWheelComponent {
    /** The chips of the players on each pocket, the first pocket first: the player of the top seat, then the bottom one */
    public readonly stakes = input.required<ReadonlyArray<SeatPair<number>>>();
    /** The players of the top and of the bottom seats, naming the stakes */
    public readonly names = input<SeatPair<string>>(['', '']);
    /** The ball shown in its pocket, none while no ball shows on this page */
    public readonly ball = input<Readonly<ShownBall> | null>(null);
    /** The ball shown was just revealed: it rolls from the hub to its pocket, which it tells once there */
    public readonly rolling = input<boolean>(false);
    /** The stakes the local player types, a field in each pocket in place of its stake: none out of its turn */
    public readonly stakeFields = input<FieldTree<ReadonlyArray<number | null>> | null>(null);
    /** The pocket the local player, croupier, places its ball in by clicking it: none out of its turn */
    public readonly pocketField = input<FieldTree<string> | null>(null);
    /** The form of the fields, which lies out of the wheel */
    public readonly formId = input<string | null>(null);
    /** The ball reached its pocket */
    public readonly rolled = output<void>();

    protected readonly ballKinds = BallKind;
    protected readonly rows = StakeRow;
    protected readonly angles: ReadonlyArray<number> = POCKET_ANGLES;
    protected readonly roll: number = inject(BALL_ROLL);
    private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    /** The pocket under the pointer of the croupier placing its ball */
    protected readonly hovered = signal<number | null>(null);

    protected readonly pockets: Signal<ReadonlyArray<Readonly<WheelPocket>>> = computed((): ReadonlyArray<Readonly<WheelPocket>> => {
        const ball: Readonly<ShownBall> | null = this.ball();
        return this.stakes().map(([top, bottom]: SeatPair<number>, index: number): WheelPocket => ({
            pocket: index + 1,
            red: isRed(index),
            top,
            bottom,
            ball: ball?.pocket === index + 1 ? ball.kind : null,
            layout: POCKET_LAYOUTS[index],
            rimFirst: index < 2,
            inset: NUMBER_INSETS[index],
        }));
    });

    /** The ball the croupier is about to place: on the pocket under its pointer, else on the one it picked, not sealed yet */
    protected readonly ghost: Signal<Readonly<{ pocket: number; picked: boolean }> | null> = computed((): Readonly<{ pocket: number; picked: boolean }> | null => {
        const field: FieldTree<string> | null = this.pocketField();
        if (field === null) {
            return null;
        }
        const value: string = field().value();
        const picked: number | null = value === '' ? null : Number(value);
        const pocket: number | null = this.hovered() ?? picked;
        return pocket === null ? null : { pocket, picked: pocket === picked };
    });

    /** Where the chips of a player on a pocket lie: the chips bet fly there, the chips settled from there */
    public stackOf(pocket: number, row: StakeRow): HTMLElement {
        return this.host.querySelector(`[data-stake="${ pocket }-${ row }"]`) as HTMLElement;
    }

    /** The ball rolling reached its pocket: an animation of the ball itself, not one of its ring */
    protected end(event: AnimationEvent): void {
        if (this.rolling() && event.target === event.currentTarget) {
            this.rolled.emit();
        }
    }
}
