import { computed, Signal, signal } from '@angular/core';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { AppleCount, AppleOutcome, CastApple, countApples, RoundGain } from './apple-count';
import { Apple, EdenRules, EdenSetup, isApple } from './eden-rules';
import { EdenResult, settleEden } from './standings';

export enum EdenPhase {
    /** The players still in commit to their apples */
    VOTING = 'voting',
    /** The players who committed reveal their apples */
    REVEALING = 'revealing',
    OVER = 'over',
}

/** Why the apple of a player did not count */
export enum MissedReason {
    /** It did not vote, or reveal its apple, in time */
    LATE = 'late',
    /** Its reveal did not match its commitment */
    INVALID = 'invalid',
    /** It revealed something else than an apple */
    ILLEGAL = 'illegal',
}

export enum EdenEventKind {
    MISSED = 'missed',
    COUNTED = 'counted',
    /** Players lost paradise */
    OUT = 'out',
}

/** What the game told, in the order of the chain: the history of the game */
export type EdenEvent =
    | { readonly kind: EdenEventKind.MISSED; readonly round: number; readonly phase: EdenPhase; readonly reason: MissedReason;
        readonly players: ReadonlyArray<number>;
        /** What each of the players lost */
        readonly amount: number }
    | { readonly kind: EdenEventKind.COUNTED; readonly round: number;
        /** The apples counted, in the order of the players */
        readonly votes: ReadonlyArray<Readonly<CastApple>>;
        readonly outcome: AppleOutcome;
        /** The player of the lone apple, red or not */
        readonly lone: number | null;
        /** The color of the most apples, or the only one, without red apple */
        readonly color: Apple | null;
        /** What each player won or lost on the round, the apples missed included, in the order of the players: none but the ones not 0 */
        readonly gains: ReadonlyArray<Readonly<RoundGain>> }
    | { readonly kind: EdenEventKind.OUT; readonly round: number; readonly players: ReadonlyArray<number> };

interface EdenState {
    readonly phase: EdenPhase;
    readonly round: number;
    /** The players still in paradise, in the order of their seats */
    readonly inPlay: ReadonlyArray<number>;
    /** The players who committed to their apples, in the order of the chain */
    readonly committed: ReadonlyArray<number>;
    /** The players whose reveal applied, or counts as none */
    readonly settled: ReadonlyArray<number>;
    readonly apples: ReadonlyArray<Readonly<CastApple>>;
    /** The players who did not vote in time */
    readonly late: ReadonlyArray<number>;
    /**
     * The players who committed to an apple and did not reveal it, in time or as committed: withholding would let them
     * change the count once they read the others, so it costs as much as a lone red apple
     */
    readonly withheld: ReadonlyArray<number>;
    /** The millions of each player */
    readonly balances: ReadonlyArray<number>;
    /** The round each player lost paradise, none for a player still in */
    readonly outAt: ReadonlyArray<number | null>;
    /** The players still in who let a phase close without acting, until they commit again: a page gives no more time to wait for them away */
    readonly absent: ReadonlyArray<number>;
    readonly events: ReadonlyArray<Readonly<EdenEvent>>;
    /** Counts the phases of the game: a claim of a timeout names the step it waited at */
    readonly step: number;
    readonly result: EdenResult | null;
}

const without = (players: ReadonlyArray<number>, others: ReadonlyArray<number>): number[] => players.filter((player: number) => !others.includes(player));

/**
 * The game, in signals, the same on every page: each round, the players still in paradise vote for an apple at the same
 * time, gold, silver or red, their apples sealed, then revealed and counted by the table of gains. A balance at the floor
 * after a round loses paradise for good; the game is over after its rounds, or once fewer than 2 players are still in.
 * Every move applies in the order of the chain; the session checks the commitments, the game the rules.
 */
export class EdenGameState {
    private readonly _state = signal<Readonly<EdenState>>(this.initial());

    public readonly phase: Signal<EdenPhase> = computed(() => this._state().phase);
    public readonly round: Signal<number> = computed(() => this._state().round);
    public readonly inPlay: Signal<ReadonlyArray<number>> = computed(() => this._state().inPlay);
    /** The players who lost paradise */
    public readonly out: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => without(this.everyone(), this._state().inPlay));
    public readonly committed: Signal<ReadonlyArray<number>> = computed(() => this._state().committed);
    public readonly balances: Signal<ReadonlyArray<number>> = computed(() => this._state().balances);
    public readonly outAt: Signal<ReadonlyArray<number | null>> = computed(() => this._state().outAt);
    public readonly absent: Signal<ReadonlyArray<number>> = computed(() => this._state().absent);
    public readonly events: Signal<ReadonlyArray<Readonly<EdenEvent>>> = computed(() => this._state().events);
    public readonly step: Signal<number> = computed(() => this._state().step);
    public readonly result: Signal<EdenResult | null> = computed(() => this._state().result);
    /** The players the phase waits for */
    public readonly awaited: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => this.awaitedIn(this._state()));
    public readonly phaseTime: Signal<number> = computed((): number =>
        this._state().phase === EdenPhase.VOTING ? this.setup.voteTime : this.rules.revealTime);

    /**
     * @param players the number of players, 3 at least
     * @param setup the seconds of a vote and the starting money, picked by the player who started the game
     */
    public constructor(
        public readonly rules: EdenRules,
        public readonly players: number,
        public readonly setup: Readonly<EdenSetup>,
    ) {}

    /** A player commits to its apple: a player absent is back */
    public commitApple(player: number): Applied {
        const state: Readonly<EdenState> = this._state();

        if (state.phase !== EdenPhase.VOTING || !this.isPlayer(player) || state.committed.includes(player)) {
            return Applied.IGNORED;
        }
        if (!state.inPlay.includes(player)) {
            return Applied.ILLEGAL;
        }

        this.move({ ...state, committed: [...state.committed, player], absent: without(state.absent, [player]) });
        return Applied.APPLIED;
    }

    /** A player reveals its apple: one that is no apple counts as withheld */
    public revealApple(player: number, apple: unknown): Applied {
        const state: Readonly<EdenState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }
        if (!isApple(apple)) {
            this.miss(player, MissedReason.ILLEGAL);
            return Applied.ILLEGAL;
        }

        this.move({ ...state, settled: [...state.settled, player], apples: [...state.apples, { player, apple }] });
        return Applied.APPLIED;
    }

    /** The reveal of a player did not match its commitment: its apple counts as withheld */
    public refuse(player: number): void {
        if (this.awaitsReveal(this._state(), player)) {
            this.miss(player, MissedReason.INVALID);
        }
    }

    /** The time of the phase is over, and the players it waits for are absent: a late voter did not vote, a late reveal withheld its apple */
    public close(): void {
        const state: Readonly<EdenState> = this._state();
        const late: ReadonlyArray<number> = this.awaitedIn(state);

        if (late.length === 0) {
            return;
        }

        // A player absent already, awaited by a vote again, stays absent once
        const absent: ReadonlyArray<number> = [...state.absent, ...without(late, state.absent)];
        const events: ReadonlyArray<Readonly<EdenEvent>> = [...state.events, this.missed(state, MissedReason.LATE, late)];
        this.move(state.phase === EdenPhase.VOTING
            ? { ...state, late: [...state.late, ...late], absent, events }
            : { ...state, settled: [...state.settled, ...late], withheld: [...state.withheld, ...late], absent, events });
    }

    private initial(): EdenState {
        return {
            phase: EdenPhase.VOTING,
            round: 0,
            inPlay: this.everyone(),
            committed: [],
            settled: [],
            apples: [],
            late: [],
            withheld: [],
            balances: this.everyone().map(() => this.setup.startMoney),
            outAt: this.everyone().map(() => null),
            absent: [],
            events: [],
            step: 0,
            result: null,
        };
    }

    private everyone(): number[] {
        return Array.from({ length: this.players }, (_, player: number) => player);
    }

    private isPlayer(player: number): boolean {
        return Number.isInteger(player) && player >= 0 && player < this.players;
    }

    private awaitsReveal(state: Readonly<EdenState>, player: number): boolean {
        return state.phase === EdenPhase.REVEALING && state.committed.includes(player) && !state.settled.includes(player);
    }

    private awaitedIn(state: Readonly<EdenState>): ReadonlyArray<number> {
        switch (state.phase) {
            case EdenPhase.VOTING:
                // Every vote waits for every player still in, absent ones too: a player back always gets the time to vote
                return without(state.inPlay, [...state.committed, ...state.late]);
            case EdenPhase.REVEALING:
                return without(state.committed, state.settled);
            case EdenPhase.OVER:
                return [];
        }
    }

    /** The players missed their apples: a vote missed costs its penalty, a reveal missed as much as a lone red apple */
    private missed(state: Readonly<EdenState>, reason: MissedReason, players: ReadonlyArray<number>): EdenEvent {
        const amount: number = state.phase === EdenPhase.VOTING ? this.rules.missPenalty : this.rules.withheldPenalty;
        return { kind: EdenEventKind.MISSED, round: state.round, phase: state.phase, reason, players, amount };
    }

    /** A reveal counting as an apple withheld */
    private miss(player: number, reason: MissedReason): void {
        const state: Readonly<EdenState> = this._state();
        this.move({
            ...state,
            settled: [...state.settled, player],
            withheld: [...state.withheld, player],
            events: [...state.events, this.missed(state, reason, [player])],
        });
    }

    /** A move applied: the phase goes on once it awaits no player */
    private move(state: Readonly<EdenState>): void {
        this._state.set(this.awaitedIn(state).length > 0 ? state : this.advanced(state));
    }

    /** The vote over: the apples revealed, then counted; nobody committed, counted at once */
    private advanced(state: Readonly<EdenState>): EdenState {
        return state.phase === EdenPhase.VOTING && state.committed.length > 0
            ? { ...state, phase: EdenPhase.REVEALING, settled: [], step: state.step + 1 }
            : this.counted(state);
    }

    /**
     * The apples counted, the penalties of the apples missed added: a balance at the floor loses paradise. The game is
     * over after its rounds, or once fewer than 2 players are still in: nobody is left to trust
     */
    private counted(state: Readonly<EdenState>): EdenState {
        const votes: ReadonlyArray<Readonly<CastApple>> = this.everyone()
            .map((player: number) => state.apples.find((cast: Readonly<CastApple>) => cast.player === player))
            .filter((cast: Readonly<CastApple> | undefined): cast is Readonly<CastApple> => cast !== undefined);
        const count: AppleCount = countApples(this.rules, votes);
        const gains: RoundGain[] = this.everyone()
            .map((player: number): RoundGain => ({
                player,
                gain: (count.gains.find((counted: Readonly<RoundGain>) => counted.player === player)?.gain ?? 0)
                    - (state.late.includes(player) ? this.rules.missPenalty : 0)
                    - (state.withheld.includes(player) ? this.rules.withheldPenalty : 0),
            }))
            .filter((round: RoundGain) => round.gain !== 0);
        const balances: number[] = state.balances.map((balance: number, player: number) =>
            balance + (gains.find((round: RoundGain) => round.player === player)?.gain ?? 0));
        const out: number[] = state.inPlay.filter((player: number) => balances[player] <= this.rules.paradiseFloor);
        const inPlay: number[] = without(state.inPlay, out);
        const outAt: ReadonlyArray<number | null> = state.outAt.map((round: number | null, player: number) => out.includes(player) ? state.round : round);
        const events: ReadonlyArray<Readonly<EdenEvent>> = [
            ...state.events,
            { kind: EdenEventKind.COUNTED, round: state.round, votes, outcome: count.outcome, lone: count.lone, color: count.color, gains },
            ...(out.length === 0 ? [] : [{ kind: EdenEventKind.OUT, round: state.round, players: out } as const]),
        ];
        const counted: EdenState = { ...state, inPlay, balances, outAt, absent: without(state.absent, out), events };

        return state.round + 1 >= this.rules.rounds || inPlay.length < 2
            ? { ...counted, phase: EdenPhase.OVER, result: settleEden(balances, outAt), step: state.step + 1 }
            : this.next(counted);
    }

    /** The next round, its vote open */
    private next(state: Readonly<EdenState>): EdenState {
        return {
            ...state,
            phase: EdenPhase.VOTING,
            round: state.round + 1,
            committed: [],
            settled: [],
            apples: [],
            late: [],
            withheld: [],
            step: state.step + 1,
        };
    }
}
