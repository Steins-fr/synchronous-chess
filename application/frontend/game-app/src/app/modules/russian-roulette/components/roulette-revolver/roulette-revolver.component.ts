import { Component, effect, inject, InjectionToken, input, output, signal, untracked } from '@angular/core';

/** How the revolver fires, once it waited in front of the player */
export enum RevolverShot {
    /** The hammer falls on an empty chamber: a dry click */
    EMPTY = 'empty',
    /** A bullet: the blast, the recoil and the smoke */
    BULLET = 'bullet',
}

/** A chamber the revolver fires: a new one for each shot, two empty chambers in a row firing twice */
export interface RevolverFire {
    readonly kind: RevolverShot;
}

/**
 * The milliseconds the revolver holds in front of the player before it fires: its travel from the cloth, then the
 * suspense. None in the specs
 */
export const REVOLVER_HOLD = new InjectionToken<number>('REVOLVER_HOLD', { factory: (): number => 3500 });

/**
 * The revolver seen from its side, the muzzle on the left. The table moves it from the cloth to the player shooting and
 * back: it aims, its hammer cocked turning its cylinder, holds still in front of the player, then fires. It looks the
 * same until it fires, whatever the chamber holds. Decorative: the table tells the shot.
 */
@Component({
    selector: 'app-roulette-revolver',
    templateUrl: './roulette-revolver.component.html',
    styleUrl: './roulette-revolver.component.scss',
    host: {
        'aria-hidden': 'true',
        '[class.aiming]': 'aiming()',
        '[class.fire-empty]': 'firing()?.kind === empty',
        '[class.fire-bullet]': 'firing()?.kind === bullet',
    },
})
export class RouletteRevolverComponent {
    /** The revolver is held, its hammer cocked, until it fires */
    public readonly aiming = input<boolean>(false);
    /** The chamber the revolver fires, once it held in front of the player */
    public readonly shot = input<Readonly<RevolverFire> | null>(null);
    /** The revolver fires: the chamber shows what it held */
    public readonly blast = output<void>();
    /** The shot is over: the revolver may go back to the cloth */
    public readonly fired = output<void>();

    private readonly hold: number = inject(REVOLVER_HOLD);
    private readonly _firing = signal<Readonly<RevolverFire> | null>(null);
    /** The shot playing, once the revolver held in front of the player */
    protected readonly firing = this._firing.asReadonly();
    protected readonly empty: RevolverShot = RevolverShot.EMPTY;
    protected readonly bullet: RevolverShot = RevolverShot.BULLET;
    /** When the revolver started aiming, from the time of the page */
    private aimedAt: number | null = null;
    /** The latest shot given, to tell a new one replacing it */
    private aimedShot: Readonly<RevolverFire> | null = null;

    // The revolver holds in front of the player from when it started aiming, the chamber fired meanwhile kept for itself.
    // A shot replacing the one still firing holds again from now, its fire played again: the revolver did not aim at it.
    // So does a shot ended while the revolver aims again, at the next player shooting meanwhile
    private readonly suspense = effect((onCleanup: (cleanup: () => void) => void): void => {
        const aiming: boolean = this.aiming();
        const shot: Readonly<RevolverFire> | null = this.shot();
        const now: number = performance.now();
        const replacing: boolean = shot !== null && this.aimedShot !== null && shot !== this.aimedShot;
        const ended: boolean = shot === null && this.aimedShot !== null;

        this.aimedShot = shot;
        if (!aiming) {
            this.aimedAt = null;
        } else if (replacing || ended || this.aimedAt === null) {
            this.aimedAt = now;
        }
        if (untracked(this._firing) !== shot) {
            this._firing.set(null);
        }
        if (shot === null || untracked(this._firing) !== null) {
            return;
        }

        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
            this._firing.set(shot);
            untracked(() => this.blast.emit());
        }, Math.max(0, (this.aimedAt ?? now) + this.hold - now));
        onCleanup(() => clearTimeout(timer));
    });

    /** The animation of the body of the revolver ends the shot, not the ones of its parts, nor its trembling */
    protected end(event: AnimationEvent): void {
        if (event.target === event.currentTarget && this._firing() !== null) {
            this.fired.emit();
        }
    }
}
