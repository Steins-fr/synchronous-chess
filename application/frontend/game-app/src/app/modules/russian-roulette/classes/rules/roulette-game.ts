import { computed, Signal, signal } from '@angular/core';
import { otherSeat, RouletteSeat, SeatPair, withSeat } from './roulette-seat';

export interface RouletteRules {
    /** The chambers of the cylinder */
    readonly chambers: number;
    /** The bullets each player loads */
    readonly bullets: number;
    /** The chips of each player at the start */
    readonly stack: number;
    /** The chips a death costs, given to the other player with the chips of the table */
    readonly death: number;
    /** The passes in a row making a draw: the bank takes the chips of the table */
    readonly passes: number;
    /** The seconds a player has for each move: then its page passes for it, or shoots when it can not pay */
    readonly turnTime: number;
    /**
     * The seconds a move gains, once, while a seated player is away: the player to act still away once its time is over
     * loses the game
     */
    readonly awayTime: number;
}

/**
 * The rules of the manga: 24 chambers, 3 bullets each, 150 chips each, a death costing 50 chips, 5 passes in a row making
 * a draw, and 45 seconds for each move, 30 more once while a player is away
 */
export const RUSSIAN_ROULETTE_RULES: RouletteRules = { chambers: 24, bullets: 3, stack: 150, death: 50, passes: 5, turnTime: 45, awayTime: 30 };

export enum RouletteActionKind {
    /** The player put chips on the table */
    PASS = 'pass',
    /** The player fired a chamber */
    SHOT = 'shot',
    /** The 5th pass in a row revealed the next chamber: passing never dodges a bullet */
    REVEAL = 'reveal',
}

export interface RouletteAction {
    readonly seat: RouletteSeat;
    readonly kind: RouletteActionKind;
    /**
     * The chips of a pass, else the chips of the table: taken by the shooter of an empty chamber, given to the other
     * player on a death; none for a chamber revealed
     */
    readonly chips: number;
    /** The bullets of the chamber fired or revealed: 0 for an empty one, 2 when both players loaded it */
    readonly bullets?: number;
    /** The pass ends a series of passes in a row: the bank took the chips of the table */
    readonly draw?: boolean;
}

export interface RouletteResult {
    /** The player with the fewest deaths, then the most chips, none when they are even */
    readonly winner: RouletteSeat | null;
    readonly deaths: SeatPair<number>;
    readonly stacks: SeatPair<number>;
}

/**
 * The 24-shot Russian roulette between two players, without the cylinder: the session fires the chambers, and tells the
 * game the bullets of each one. Each action returns whether it was legal: an illegal one changes nothing.
 */
export class RouletteGame {
    private readonly _first = signal<RouletteSeat | null>(null);
    /** The player shooting first, drawn once the cylinder is loaded: null until then */
    public readonly first = this._first.asReadonly();
    private readonly _stacks = signal<SeatPair<number>>([this.rules.stack, this.rules.stack]);
    /** The chips of each player: a death may take it below 0, a debt */
    public readonly stacks = this._stacks.asReadonly();
    private readonly _table = signal<number>(0);
    /** The chips the players passing put on the table */
    public readonly table = this._table.asReadonly();
    private readonly _bank = signal<number>(0);
    /** The chips of the draws */
    public readonly bank = this._bank.asReadonly();
    private readonly _streak = signal<number>(0);
    /** The passes in a row */
    public readonly streak = this._streak.asReadonly();
    private readonly _deaths = signal<SeatPair<number>>([0, 0]);
    public readonly deaths = this._deaths.asReadonly();
    private readonly _chambers = signal<ReadonlyArray<number>>([]);
    /** The bullets of each chamber fired, in their order */
    public readonly chambers = this._chambers.asReadonly();
    private readonly _actions = signal<ReadonlyArray<Readonly<RouletteAction>>>([]);
    public readonly actions = this._actions.asReadonly();
    private readonly _turn = signal<RouletteSeat | null>(null);
    private readonly _shooting = signal<RouletteSeat | null>(null);
    /** The player who fired a chamber, until the cylinder tells its bullets */
    public readonly shooting = this._shooting.asReadonly();
    private readonly _revealing = signal<RouletteSeat | null>(null);
    /** The player whose pass was the 5th in a row, until the cylinder tells the bullets of the chamber it revealed */
    public readonly revealing = this._revealing.asReadonly();
    private readonly _forfeited = signal<RouletteSeat | null>(null);
    /** The player who lost the game on time */
    public readonly forfeited = this._forfeited.asReadonly();

    /** The bullets fired */
    public readonly firedBullets: Signal<number> = computed((): number => this._chambers().reduce((sum: number, bullets: number) => sum + bullets, 0));

    /** Every bullet fired, or every chamber */
    private readonly finished: Signal<boolean> = computed((): boolean =>
        this.firedBullets() >= 2 * this.rules.bullets || this._chambers().length >= this.rules.chambers);

    public readonly over: Signal<boolean> = computed((): boolean => this._forfeited() !== null || this.finished());

    /** The player to shoot or pass, null before the draw, while a chamber fires or is revealed, and once the game is over */
    public readonly toAct: Signal<RouletteSeat | null> = computed((): RouletteSeat | null =>
        this.over() || this._shooting() !== null || this._revealing() !== null ? null : this._turn());

    /** The chips of the next pass: 1, doubled at each pass in a row */
    public readonly passPrice: Signal<number> = computed((): number => 2 ** this._streak());

    public readonly result: Signal<RouletteResult | null> = computed((): RouletteResult | null => {
        const [deaths, stacks, forfeited] = [this._deaths(), this._stacks(), this._forfeited()];

        if (forfeited !== null) {
            return { winner: otherSeat(forfeited), deaths, stacks };
        }

        return this.finished() ? { winner: RouletteGame.leader(deaths, stacks), deaths, stacks } : null;
    });

    public constructor(public readonly rules: RouletteRules = RUSSIAN_ROULETTE_RULES) {
    }

    private static leader(deaths: SeatPair<number>, stacks: SeatPair<number>): RouletteSeat | null {
        if (deaths[0] !== deaths[1]) {
            return deaths[0] < deaths[1] ? RouletteSeat.ONE : RouletteSeat.TWO;
        }
        if (stacks[0] !== stacks[1]) {
            return stacks[0] > stacks[1] ? RouletteSeat.ONE : RouletteSeat.TWO;
        }
        return null;
    }

    /** The cylinder is loaded and spun: the player drawn shoots or passes first */
    public start(first: RouletteSeat): boolean {
        if (this._first() !== null || this.over()) {
            return false;
        }
        this._first.set(first);
        this._turn.set(first);
        return true;
    }

    /** Whether the player to act has the chips of the pass: without them, it shoots */
    public canPass(seat: RouletteSeat): boolean {
        return this.toAct() === seat && this._stacks()[seat] >= this.passPrice();
    }

    public pass(seat: RouletteSeat): boolean {
        if (!this.canPass(seat)) {
            return false;
        }

        const chips: number = this.passPrice();
        const draw: boolean = this._streak() + 1 >= this.rules.passes;
        this._stacks.update((stacks: SeatPair<number>) => withSeat(stacks, seat, stacks[seat] - chips));
        if (draw) {
            this._bank.update((bank: number) => bank + this._table() + chips);
            this._table.set(0);
            this._streak.set(0);
            this._revealing.set(seat);
        } else {
            this._table.update((table: number) => table + chips);
            this._streak.update((streak: number) => streak + 1);
        }
        this._actions.update((actions: ReadonlyArray<Readonly<RouletteAction>>) => [...actions, { seat, kind: RouletteActionKind.PASS, chips, draw }]);
        this._turn.set(otherSeat(seat));
        return true;
    }

    /** The player fires the next chamber: the game waits for its bullets */
    public shoot(seat: RouletteSeat): boolean {
        if (this.toAct() !== seat) {
            return false;
        }
        this._shooting.set(seat);
        return true;
    }

    /**
     * The bullets of the chamber fired: empty, the shooter takes the table; loaded, by one player or both, it is one
     * death, and the shooter gives the chips of a death and the table to the other player. A chamber revealed by the 5th
     * pass in a row kills no one: its bullets are spent
     */
    public fire(bullets: number): boolean {
        const shooter: RouletteSeat | null = this._shooting();
        const revealer: RouletteSeat | null = this._revealing();

        // A share late once the game was lost on time fires nothing
        if (this.over() || (shooter === null && revealer === null) || !Number.isInteger(bullets) || bullets < 0 || bullets > 2) {
            return false;
        }

        this._chambers.update((chambers: ReadonlyArray<number>) => [...chambers, bullets]);
        if (revealer !== null) {
            this._actions.update((actions: ReadonlyArray<Readonly<RouletteAction>>) => [...actions, { seat: revealer, kind: RouletteActionKind.REVEAL, chips: 0, bullets }]);
            this._revealing.set(null);
            return true;
        }
        this.shot(shooter as RouletteSeat, bullets);
        return true;
    }

    private shot(shooter: RouletteSeat, bullets: number): void {
        const table: number = this._table();
        if (bullets === 0) {
            this._stacks.update((stacks: SeatPair<number>) => withSeat(stacks, shooter, stacks[shooter] + table));
        } else {
            const other: RouletteSeat = otherSeat(shooter);
            this._deaths.update((deaths: SeatPair<number>) => withSeat(deaths, shooter, deaths[shooter] + 1));
            this._stacks.update((stacks: SeatPair<number>) =>
                withSeat(withSeat(stacks, shooter, stacks[shooter] - this.rules.death), other, stacks[other] + this.rules.death + table));
        }
        this._table.set(0);
        this._streak.set(0);
        this._actions.update((actions: ReadonlyArray<Readonly<RouletteAction>>) => [...actions, { seat: shooter, kind: RouletteActionKind.SHOT, chips: table, bullets }]);
        this._shooting.set(null);
        this._turn.set(otherSeat(shooter));
    }

    /** A player ran out of time, away from the table or not giving its part of the cylinder: it loses the game */
    public forfeit(seat: RouletteSeat): boolean {
        if (this.over()) {
            return false;
        }
        this._forfeited.set(seat);
        return true;
    }
}
