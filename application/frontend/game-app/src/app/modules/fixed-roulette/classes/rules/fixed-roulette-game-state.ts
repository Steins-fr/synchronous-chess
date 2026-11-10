import { computed, Signal, signal } from '@angular/core';
import { otherSeat, SeatPair, withSeat } from '@app/helpers/seat-pair.helper';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { Bets, betError, croupierOf, FixedRouletteRules, FixedRouletteSetup, isPocket, Side, totalOf } from './fixed-roulette-rules';
import { GameBets, payoutOf, PlacedBets, settle, Settlement } from './settlement';

export enum FixedRoulettePhase {
    /** The croupier seals the pocket of the ball and bets */
    PLACING = 'placing',
    /** The punter bets */
    BETTING = 'betting',
    /** The croupier reveals the ball */
    REVEALING = 'revealing',
    OVER = 'over',
}

/** How a croupier cheated with its ball: the match is forfeit */
export enum CheatKind {
    /** Its reveal did not match its commitment */
    INVALID_REVEAL = 'invalidReveal',
    /** It revealed a ball out of the pockets of the wheel */
    ILLEGAL_POCKET = 'illegalPocket',
}

/** Why the match is over */
export enum MatchEnd {
    /** Its games were played */
    GAMES = 'games',
    /** A player has no chip left */
    BANKRUPT = 'bankrupt',
    /** A player missed its time */
    FORFEIT = 'forfeit',
    /** The croupier cheated with its ball */
    CHEAT = 'cheat',
}

export interface FixedRouletteResult {
    /** The index of the player with the more chips, or of the one who did not forfeit; none on equal chips */
    readonly winner: number | null;
    readonly end: MatchEnd;
    /** The phase a player missed, or how the croupier cheated: none for a match played to its end */
    readonly cause: FixedRoulettePhase | CheatKind | null;
    /** The chips of each player at the end, in the order of their seats */
    readonly chips: SeatPair<number>;
}

export enum FixedRouletteEventKind {
    /** The croupier sealed its ball and bet */
    PLACED = 'placed',
    /** The punter bet */
    BET = 'bet',
    /** The ball revealed, the chips settled */
    SETTLED = 'settled',
    /** A player missed its time: it forfeits the match */
    LATE = 'late',
    /** The croupier cheated with its ball: it forfeits the match */
    CHEATED = 'cheated',
}

/** What the match told, in the order of the chain: the history of the match */
export type FixedRouletteEvent =
    | { readonly kind: FixedRouletteEventKind.PLACED; readonly round: number; readonly croupier: number; readonly bets: Bets }
    | { readonly kind: FixedRouletteEventKind.BET; readonly round: number; readonly punter: number; readonly bets: Bets }
    | { readonly kind: FixedRouletteEventKind.SETTLED; readonly round: number; readonly croupier: number;
        /** The pocket of the ball */
        readonly ball: number;
        readonly bets: GameBets;
        readonly settlement: Readonly<Settlement> }
    | { readonly kind: FixedRouletteEventKind.LATE; readonly round: number; readonly player: number; readonly phase: FixedRoulettePhase }
    | { readonly kind: FixedRouletteEventKind.CHEATED; readonly round: number; readonly player: number; readonly reason: CheatKind };

export type SettledEvent = Extract<FixedRouletteEvent, { readonly kind: FixedRouletteEventKind.SETTLED }>;

interface FixedRouletteState {
    readonly phase: FixedRoulettePhase;
    /** The index of the game in the match */
    readonly round: number;
    readonly bets: PlacedBets;
    /** The chips each player holds off the table, in the order of their seats: its bets of the game leave them */
    readonly chips: SeatPair<number>;
    /** The chips the bank took in the match */
    readonly bank: number;
    readonly events: ReadonlyArray<Readonly<FixedRouletteEvent>>;
    /** Counts the phases of the match: a claim of a timeout names the step it waited at */
    readonly step: number;
    readonly result: FixedRouletteResult | null;
}

const NO_BETS: PlacedBets = { [Side.CROUPIER]: null, [Side.PUNTER]: null };

/**
 * The match, in signals, the same on every page: in each game, the croupier seals the pocket of the ball and bets, the
 * punter bets, then the croupier reveals the ball and the chips settle. The players swap their roles each game. The match
 * is over after its games, or at once when a player has no chip left; the more chips win. Every move applies in the order
 * of the chain; the session checks the commitments, the game the rules.
 *
 * A player missing its time forfeits the match, as a croupier revealing a ball it did not commit to, or out of the
 * wheel: the bets on the table go back to their owners.
 */
export class FixedRouletteGameState {
    private readonly _state = signal<Readonly<FixedRouletteState>>(this.initial());

    public readonly phase: Signal<FixedRoulettePhase> = computed(() => this._state().phase);
    public readonly round: Signal<number> = computed(() => this._state().round);
    public readonly croupier: Signal<number> = computed((): number => croupierOf(this._state().round, this.first));
    public readonly punter: Signal<number> = computed((): number => otherSeat(this.croupier()));
    /** The bets of the game, each side once it bet */
    public readonly bets: Signal<PlacedBets> = computed(() => this._state().bets);
    /** The chips each player holds off the table */
    public readonly chips: Signal<SeatPair<number>> = computed(() => this._state().chips);
    public readonly bank: Signal<number> = computed(() => this._state().bank);
    public readonly events: Signal<ReadonlyArray<Readonly<FixedRouletteEvent>>> = computed(() => this._state().events);
    public readonly step: Signal<number> = computed(() => this._state().step);
    public readonly result: Signal<FixedRouletteResult | null> = computed(() => this._state().result);
    /** The player the phase waits for */
    public readonly awaited: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => this.awaitedIn(this._state()));
    public readonly phaseTime: Signal<number> = computed((): number =>
        this._state().phase === FixedRoulettePhase.REVEALING ? this.rules.revealTime : this.setup.betTime);

    /**
     * @param setup the seconds of the bets, picked by the player who started the match
     * @param first the croupier of the first game, drawn from the seed of the match
     */
    public constructor(
        public readonly rules: FixedRouletteRules,
        public readonly setup: Readonly<FixedRouletteSetup>,
        public readonly first: number,
    ) {}

    /** The croupier sealed its ball and bets, the bets checked by the rules: refused, it still has to bet */
    public place(player: number, bets: Bets): Applied {
        const state: Readonly<FixedRouletteState> = this._state();
        const croupier: number = croupierOf(state.round, this.first);

        if (state.phase !== FixedRoulettePhase.PLACING || !this.isPlayer(player)) {
            return Applied.IGNORED;
        }
        if (player !== croupier || betError(this.rules, Side.CROUPIER, state.chips[croupier], 0, bets) !== null) {
            return Applied.ILLEGAL;
        }

        this._state.set({
            ...state,
            phase: FixedRoulettePhase.BETTING,
            bets: { ...state.bets, [Side.CROUPIER]: bets },
            chips: withChips(state.chips, croupier, -totalOf(bets)),
            events: [...state.events, { kind: FixedRouletteEventKind.PLACED, round: state.round, croupier, bets }],
            step: state.step + 1,
        });
        return Applied.APPLIED;
    }

    /** The punter bets after the croupier, the bets checked by the rules: refused, it still has to bet */
    public bet(player: number, bets: Bets): Applied {
        const state: Readonly<FixedRouletteState> = this._state();
        const punter: number = otherSeat(croupierOf(state.round, this.first));

        if (state.phase !== FixedRoulettePhase.BETTING || !this.isPlayer(player)) {
            return Applied.IGNORED;
        }
        if (player !== punter || betError(this.rules, Side.PUNTER, state.chips[punter], totalOf(state.bets[Side.CROUPIER] as Bets), bets) !== null) {
            return Applied.ILLEGAL;
        }

        this._state.set({
            ...state,
            phase: FixedRoulettePhase.REVEALING,
            bets: { ...state.bets, [Side.PUNTER]: bets },
            chips: withChips(state.chips, punter, -totalOf(bets)),
            events: [...state.events, { kind: FixedRouletteEventKind.BET, round: state.round, punter, bets }],
            step: state.step + 1,
        });
        return Applied.APPLIED;
    }

    /** The croupier reveals its ball, matching its commitment: the chips settle. A ball out of the wheel forfeits the match */
    public reveal(player: number, ball: unknown): Applied {
        const state: Readonly<FixedRouletteState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }
        if (!isPocket(this.rules, ball)) {
            this._state.set(this.cheated(state, CheatKind.ILLEGAL_POCKET));
            return Applied.ILLEGAL;
        }

        this._state.set(this.settled(state, ball));
        return Applied.APPLIED;
    }

    /** The reveal of the croupier did not match its commitment: it forfeits the match */
    public refuse(player: number): Applied {
        const state: Readonly<FixedRouletteState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }

        this._state.set(this.cheated(state, CheatKind.INVALID_REVEAL));
        return Applied.APPLIED;
    }

    /** The time of the phase is over, and the player it waits for is absent: it forfeits the match */
    public close(): Applied {
        const state: Readonly<FixedRouletteState> = this._state();
        const [late] = this.awaitedIn(state);

        if (late === undefined) {
            return Applied.IGNORED;
        }

        this._state.set(this.forfeit(
            state, late, MatchEnd.FORFEIT, state.phase, { kind: FixedRouletteEventKind.LATE, round: state.round, player: late, phase: state.phase },
        ));
        return Applied.APPLIED;
    }

    private initial(): FixedRouletteState {
        return {
            phase: FixedRoulettePhase.PLACING,
            round: 0,
            bets: NO_BETS,
            chips: [this.rules.startChips, this.rules.startChips],
            bank: 0,
            events: [],
            step: 0,
            result: null,
        };
    }

    private isPlayer(player: number): boolean {
        return player === 0 || player === 1;
    }

    private awaitsReveal(state: Readonly<FixedRouletteState>, player: number): boolean {
        return state.phase === FixedRoulettePhase.REVEALING && player === croupierOf(state.round, this.first);
    }

    private awaitedIn(state: Readonly<FixedRouletteState>): ReadonlyArray<number> {
        const croupier: number = croupierOf(state.round, this.first);
        switch (state.phase) {
            case FixedRoulettePhase.PLACING:
            case FixedRoulettePhase.REVEALING:
                return [croupier];
            case FixedRoulettePhase.BETTING:
                return [otherSeat(croupier)];
            case FixedRoulettePhase.OVER:
                return [];
        }
    }

    /** The croupier cheated with its ball */
    private cheated(state: Readonly<FixedRouletteState>, reason: CheatKind): FixedRouletteState {
        const player: number = croupierOf(state.round, this.first);
        return this.forfeit(state, player, MatchEnd.CHEAT, reason, { kind: FixedRouletteEventKind.CHEATED, round: state.round, player, reason });
    }

    /** A player forfeits the match: the game is void, the bets on the table back to their owners, the other player wins */
    private forfeit(
        state: Readonly<FixedRouletteState>, player: number, end: MatchEnd, cause: FixedRoulettePhase | CheatKind, event: FixedRouletteEvent,
    ): FixedRouletteState {
        const croupier: number = croupierOf(state.round, this.first);
        const chips: SeatPair<number> = withChips(
            withChips(state.chips, croupier, totalOf(state.bets[Side.CROUPIER] ?? [])), otherSeat(croupier), totalOf(state.bets[Side.PUNTER] ?? []),
        );

        return {
            ...state,
            phase: FixedRoulettePhase.OVER,
            bets: NO_BETS,
            chips,
            events: [...state.events, event],
            step: state.step + 1,
            result: { winner: otherSeat(player), end, cause, chips },
        };
    }

    /** The ball revealed: the chips of the table settle, then the next game */
    private settled(state: Readonly<FixedRouletteState>, ball: number): FixedRouletteState {
        const croupier: number = croupierOf(state.round, this.first);
        const bets: GameBets = state.bets as GameBets;
        const settlement: Settlement = settle(bets, ball);
        const chips: SeatPair<number> = withChips(
            withChips(state.chips, croupier, payoutOf(settlement, Side.CROUPIER)), otherSeat(croupier), payoutOf(settlement, Side.PUNTER),
        );

        return this.next({
            ...state,
            chips,
            bank: state.bank + settlement.bank,
            events: [...state.events, { kind: FixedRouletteEventKind.SETTLED, round: state.round, croupier, ball, bets, settlement }],
        });
    }

    /** The next game, or the end of the match: after its games, or at once when a player has no chip left */
    private next(state: Readonly<FixedRouletteState>): FixedRouletteState {
        const [one, two] = state.chips;
        const bankrupt: boolean = one === 0 || two === 0;

        if (bankrupt || state.round + 1 >= this.rules.games) {
            return {
                ...state,
                phase: FixedRoulettePhase.OVER,
                bets: NO_BETS,
                step: state.step + 1,
                result: { winner: winnerOf(state.chips), end: bankrupt ? MatchEnd.BANKRUPT : MatchEnd.GAMES, cause: null, chips: state.chips },
            };
        }
        return { ...state, phase: FixedRoulettePhase.PLACING, round: state.round + 1, bets: NO_BETS, step: state.step + 1 };
    }
}

/** The player with the more chips, none on equal chips */
function winnerOf([one, two]: SeatPair<number>): number | null {
    if (one === two) {
        return null;
    }
    return one > two ? 0 : 1;
}

/** The chips of a player changed by an amount */
function withChips(chips: SeatPair<number>, player: number, amount: number): SeatPair<number> {
    return withSeat(chips, player, chips[player] + amount);
}
