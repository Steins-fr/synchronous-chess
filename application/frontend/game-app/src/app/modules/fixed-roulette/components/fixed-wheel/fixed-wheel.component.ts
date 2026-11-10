import { Component, computed, ElementRef, inject, input, Signal } from '@angular/core';
import { SeatPair } from '@app/helpers/seat-pair.helper';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { TranslocoDirective } from '@jsverse/transloco';

/** The row of a stake in a betting cell: the player of the top seat, or of the bottom one */
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

/** A point of the disk, in the units of its view box */
interface DiskPoint {
    readonly x: number;
    readonly y: number;
}

/** A pocket of the disk: its number, red or black, and where the ball lies in it */
interface DiskPocket {
    readonly pocket: number;
    readonly red: boolean;
    readonly number: DiskPoint;
    readonly ball: DiskPoint;
}

/** A line between two pockets of the disk */
interface DiskDivider {
    readonly from: DiskPoint;
    readonly to: DiskPoint;
}

/** The betting cell of a pocket: the stakes of the top and the bottom players, and the ball when it lies there */
interface BettingCell {
    readonly pocket: number;
    readonly red: boolean;
    readonly top: number;
    readonly bottom: number;
    readonly ball: BallKind | null;
}

/** The middle of the disk, in its view box of 100 units */
const CENTER: number = 50;
/** The radius of the numbers of the pockets, of their ball, of the hub and of the face inside the rim */
const NUMBER_RADIUS: number = 21;
const BALL_RADIUS: number = 34;
const HUB_RADIUS: number = 10;
const FACE_RADIUS: number = 42;

/** A point of the disk, at an angle from the top, clockwise, and a distance from its middle */
function pointAt(degrees: number, radius: number): DiskPoint {
    const angle: number = degrees * Math.PI / 180;
    const round = (value: number): number => Math.round(value * 100) / 100;
    return { x: round(CENTER + radius * Math.sin(angle)), y: round(CENTER - radius * Math.cos(angle)) };
}

/** The pockets of a roulette are red and black by turns, the first one red */
const isRed = (pocket: number): boolean => pocket % 2 === 1;

/**
 * The fixed wheel of the roulette: a small disk that never spins, its pockets numbered, red and black, around a hub,
 * and under it a betting cell for each pocket, the stake of the player of the top seat above its number, the one of the
 * bottom seat below. The ball shows in its pocket: the ball the local player sealed, on its page only, then the ball
 * revealed, until the next game places its own. The disk is decorative: each betting cell tells its pocket, the ball
 * and the stakes to a screen reader
 */
@Component({
    selector: 'app-fixed-wheel',
    templateUrl: './fixed-wheel.component.html',
    imports: [ChipStackComponent, TranslocoDirective],
    host: { class: 'flex flex-col items-center gap-2' },
})
export class FixedWheelComponent {
    /** The chips of the players on each pocket, the first pocket first: the player of the top seat, then the bottom one */
    public readonly stakes = input.required<ReadonlyArray<SeatPair<number>>>();
    /** The players of the top and of the bottom seats, naming the stakes */
    public readonly names = input<SeatPair<string>>(['', '']);
    /** The ball shown in its pocket, none while no ball shows on this page */
    public readonly ball = input<Readonly<ShownBall> | null>(null);

    protected readonly ballKinds = BallKind;
    protected readonly rows = StakeRow;
    protected readonly center: number = CENTER;
    protected readonly hubRadius: number = HUB_RADIUS;
    protected readonly faceRadius: number = FACE_RADIUS;
    private readonly host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    protected readonly pockets: Signal<ReadonlyArray<Readonly<DiskPocket>>> = computed((): ReadonlyArray<Readonly<DiskPocket>> => {
        const count: number = this.stakes().length;
        return Array.from({ length: count }, (_, index: number): DiskPocket => {
            const angle: number = (index + 0.5) * 360 / count;
            return { pocket: index + 1, red: isRed(index + 1), number: pointAt(angle, NUMBER_RADIUS), ball: pointAt(angle, BALL_RADIUS) };
        });
    });
    protected readonly dividers: Signal<ReadonlyArray<Readonly<DiskDivider>>> = computed((): ReadonlyArray<Readonly<DiskDivider>> => {
        const count: number = this.stakes().length;
        return Array.from({ length: count }, (_, index: number): DiskDivider => {
            const angle: number = index * 360 / count;
            return { from: pointAt(angle, HUB_RADIUS), to: pointAt(angle, FACE_RADIUS) };
        });
    });
    /** The pocket of the disk the ball lies in */
    protected readonly ballPocket: Signal<Readonly<DiskPocket> | null> = computed((): Readonly<DiskPocket> | null => {
        const ball: Readonly<ShownBall> | null = this.ball();
        return ball === null ? null : this.pockets()[ball.pocket - 1];
    });
    protected readonly cells: Signal<ReadonlyArray<Readonly<BettingCell>>> = computed((): ReadonlyArray<Readonly<BettingCell>> => {
        const ball: Readonly<ShownBall> | null = this.ball();
        return this.stakes().map(([top, bottom]: SeatPair<number>, index: number): BettingCell => ({
            pocket: index + 1,
            red: isRed(index + 1),
            top,
            bottom,
            ball: ball?.pocket === index + 1 ? ball.kind : null,
        }));
    });

    /** Where the chips of a player on a pocket lie: the chips bet fly there, the chips settled from there */
    public stackOf(pocket: number, row: StakeRow): HTMLElement {
        return this.host.querySelector(`[data-stake="${ pocket }-${ row }"]`) as HTMLElement;
    }
}
