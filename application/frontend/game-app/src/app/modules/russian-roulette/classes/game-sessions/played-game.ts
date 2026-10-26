import { computed, Signal, signal } from '@angular/core';
import { Cylinder, CylinderVerification } from '../cylinder/cylinder';
import { CylinderPhase } from '../cylinder/cylinder-state';
import { RouletteGame, RouletteResult, RouletteRules } from '../rules/roulette-game';
import { otherSeat, RouletteSeat, SeatPair } from '../rules/roulette-seat';

/**
 * A game of the room: its rules, its cylinder once both seats are taken, and its result, final once the cylinder is
 * checked. A former game keeps its own: its players may disclose their keys once the next game started.
 */
export class PlayedGame {
    public readonly game: RouletteGame;
    private readonly _cylinder = signal<Cylinder | null>(null);
    /** The cylinder of the players of the seats, a new one when they change before the game started */
    public readonly cylinder: Signal<Cylinder | null> = this._cylinder.asReadonly();
    private readonly _withheld = signal<RouletteSeat | null>(null);
    /** The player who did not disclose its key once its time was over */
    public readonly withheld: Signal<RouletteSeat | null> = this._withheld.asReadonly();

    /** The players of the cylinder: the ones of the seats, final once the game started */
    public readonly players: Signal<SeatPair<string | null>> = computed((): SeatPair<string | null> => this._cylinder()?.players ?? [null, null]);
    /** A player gave its key: the seats are final until the game is over */
    public readonly started: Signal<boolean> = computed((): boolean => (this._cylinder()?.progress() ?? 0) > 0);
    /** A spin that is not a cylinder, or a chamber not holding 0 to 2 bullets: the game stops */
    public readonly broken: Signal<boolean> = computed((): boolean => this._cylinder()?.phase() === CylinderPhase.BROKEN);
    /** The game is over, or stopped by a broken cylinder */
    public readonly over: Signal<boolean> = computed((): boolean => this.game.over() || this.broken());

    /** The check of the cylinder, once its keys are disclosed: a game over before it was spun has nothing to check */
    public readonly verification: Signal<CylinderVerification> = computed((): CylinderVerification =>
        this._cylinder()?.verification() ?? CylinderVerification.PENDING);

    /** The players whose spin was made otherwise: a spin not a cylinder at once, the others once the cylinder is checked */
    public readonly cheaters: Signal<ReadonlyArray<RouletteSeat>> = computed((): ReadonlyArray<RouletteSeat> => {
        const cylinder: Cylinder | null = this._cylinder();
        return cylinder === null ? [] : cylinder.cheaters().map((player: string) => cylinder.players.indexOf(player));
    });

    /**
     * The result of the game: a player whose spin was cheated, or who withheld its key, loses whatever the chambers fired,
     * a game stopped by its broken cylinder included
     */
    public readonly result: Signal<RouletteResult | null> = computed((): RouletteResult | null => {
        const played: RouletteResult | null = this.game.result();
        const withheld: RouletteSeat | null = this._withheld();
        const cheaters: ReadonlyArray<RouletteSeat> = this.cheaters();

        if (cheaters.length > 0) {
            const { deaths, stacks } = played ?? { deaths: this.game.deaths(), stacks: this.game.stacks() };
            return { deaths, stacks, winner: cheaters.length === 1 ? otherSeat(cheaters[0]) : null };
        }
        if (played === null) {
            return null;
        }
        return withheld === null ? played : { ...played, winner: otherSeat(withheld) };
    });

    /**
     * The result of a cylinder spun waits for its check, a game lost on time included: the key of its late player is
     * awaited, then withheld once its time is over. A game over before the spin has nothing to check
     */
    public readonly provisional: Signal<boolean> = computed((): boolean => {
        const phase: CylinderPhase | undefined = this._cylinder()?.phase();
        return this.result() !== null && this._withheld() === null && (phase === CylinderPhase.READY || phase === CylinderPhase.BROKEN)
            && ![CylinderVerification.FAIR, CylinderVerification.CHEATED].includes(this.verification());
    });

    public constructor(rules?: RouletteRules) {
        this.game = new RouletteGame(rules);
    }

    /** The cylinder of the players of the seats, before the game started: the former one is dropped */
    public prepare(cylinder: Cylinder | null): void {
        this._cylinder()?.destroy();
        this._cylinder.set(cylinder);
    }

    /** The player late once the game is over: it did not disclose its key */
    public withhold(seat: RouletteSeat): void {
        this._withheld.set(seat);
    }

    /** Once the game is over, or stopped, the players disclose their keys: the cylinder is checked once spun */
    public discloseOnceOver(): void {
        const cylinder: Cylinder | null = this._cylinder();

        if (this.over() && cylinder !== null && [CylinderPhase.READY, CylinderPhase.BROKEN].includes(cylinder.phase())) {
            cylinder.requestDisclosure();
        }
    }
}
