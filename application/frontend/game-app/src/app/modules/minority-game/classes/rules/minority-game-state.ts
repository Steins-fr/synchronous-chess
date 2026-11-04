import { computed, Signal, signal } from '@angular/core';
import { AskerDraw } from './asker';
import { isVote, MinorityRules, MinoritySetup, MinorityVariant, Vote } from './minority-rules';
import { MinorityResult, settleElimination, settleScore } from './standings';

export enum MinorityPhase {
    /** The asker drawn types its question */
    ASKING = 'asking',
    /** The players still in commit to their votes */
    VOTING = 'voting',
    /** The players who committed reveal their votes */
    REVEALING = 'revealing',
    OVER = 'over',
}

/** Why the vote of a player did not count */
export enum MissedReason {
    /** It did not vote, or reveal its vote, in time */
    LATE = 'late',
    /** Its reveal did not match its commitment */
    INVALID = 'invalid',
    /** It revealed something else than yes or no */
    ILLEGAL = 'illegal',
}

/** What a count told */
export enum VoteOutcome {
    /** One side has fewer votes: the minority */
    MINORITY = 'minority',
    TIE = 'tie',
    /** Every vote counted on one side */
    UNANIMOUS = 'unanimous',
    /** No vote counted */
    NO_VOTE = 'noVote',
}

export interface CastVote {
    readonly player: number;
    readonly vote: Vote;
}

/** The points a player scored on a question, or lost withholding its vote */
export interface RoundPoints {
    readonly player: number;
    readonly points: number;
}

export enum MinorityEventKind {
    ASKED = 'asked',
    ASKER_LATE = 'askerLate',
    MISSED = 'missed',
    COUNTED = 'counted',
}

/** What the game told, in the order of the chain: the history of the game */
export type MinorityEvent =
    | { readonly kind: MinorityEventKind.ASKED; readonly round: number; readonly asker: number; readonly question: string }
    | { readonly kind: MinorityEventKind.ASKER_LATE; readonly round: number; readonly asker: number }
    | { readonly kind: MinorityEventKind.MISSED; readonly round: number; readonly phase: MinorityPhase; readonly reason: MissedReason;
        readonly players: ReadonlyArray<number> }
    | { readonly kind: MinorityEventKind.COUNTED; readonly round: number; readonly asker: number; readonly question: string;
        /** The votes revealed, in the order of the players */
        readonly votes: ReadonlyArray<Readonly<CastVote>>;
        readonly outcome: VoteOutcome;
        /** The players the count eliminated: the majority side, and the votes missed */
        readonly eliminated: ReadonlyArray<number>;
        /** The points of the question, in the order of the players: none but the ones scored or lost */
        readonly points: ReadonlyArray<Readonly<RoundPoints>> };

/** What a move did */
export enum Applied {
    APPLIED = 'applied',
    /** Against the rules: the session reports it */
    ILLEGAL = 'illegal',
    /** Out of its phase, from a player not awaited, or sent again: the first one counts */
    IGNORED = 'ignored',
}

interface MinorityState {
    readonly phase: MinorityPhase;
    /** The index of the question: the round, in the score variant */
    readonly round: number;
    /** The askers drawn for the question before: one late gives way to another */
    readonly ask: number;
    /** The asker of the question, none until it is drawn */
    readonly asker: number | null;
    /** The asker of the question before: another player asks the next one */
    readonly lastAsker: number | null;
    readonly question: string | null;
    /** The players still in, in the order of their seats */
    readonly alive: ReadonlyArray<number>;
    /** The players who committed to their votes, in the order of the chain */
    readonly committed: ReadonlyArray<number>;
    /** The players whose reveal applied, or counts as none */
    readonly settled: ReadonlyArray<number>;
    readonly votes: ReadonlyArray<Readonly<CastVote>>;
    /** The players who did not vote in time */
    readonly late: ReadonlyArray<number>;
    /**
     * The players who committed to a vote and did not reveal it, in time or as committed: withholding would let them
     * change the count once they read the others, so they are eliminated, or lose points
     */
    readonly withheld: ReadonlyArray<number>;
    readonly scores: ReadonlyArray<number>;
    /** The question that eliminated each player, none for a player still in */
    readonly eliminatedAt: ReadonlyArray<number | null>;
    /** The players who let a phase close without acting: not drawn to ask, nor awaited in the score variant, until they vote again */
    readonly absent: ReadonlyArray<number>;
    readonly events: ReadonlyArray<Readonly<MinorityEvent>>;
    /** Counts the phases of the game: a claim of a timeout names the step it waited at */
    readonly step: number;
    readonly result: MinorityResult | null;
}

const without = (players: ReadonlyArray<number>, others: ReadonlyArray<number>): number[] => players.filter((player: number) => !others.includes(player));

/**
 * The game, in signals, the same on every page: a player drawn asks a question answered by yes or no, then the players
 * still in vote at the same time, their votes sealed, then revealed. Every move applies in the order of the chain; the
 * session checks the commitments and draws the askers, the game the rules.
 *
 * In the elimination variant, the majority side is eliminated, a tie or a unanimous vote asking a new question, until 1
 * or 2 players are left; a vote missed eliminates its player. In the score variant, nobody is eliminated: each player of
 * the minority side scores the votes of the majority side, over a fixed number of questions.
 */
export class MinorityGameState {
    private readonly _state = signal<Readonly<MinorityState>>(this.initial());

    public readonly phase: Signal<MinorityPhase> = computed(() => this._state().phase);
    public readonly round: Signal<number> = computed(() => this._state().round);
    public readonly ask: Signal<number> = computed(() => this._state().ask);
    public readonly asker: Signal<number | null> = computed(() => this._state().asker);
    public readonly question: Signal<string | null> = computed(() => this._state().question);
    public readonly alive: Signal<ReadonlyArray<number>> = computed(() => this._state().alive);
    public readonly eliminated: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => without(this.everyone(), this._state().alive));
    public readonly committed: Signal<ReadonlyArray<number>> = computed(() => this._state().committed);
    public readonly scores: Signal<ReadonlyArray<number>> = computed(() => this._state().scores);
    public readonly eliminatedAt: Signal<ReadonlyArray<number | null>> = computed(() => this._state().eliminatedAt);
    public readonly absent: Signal<ReadonlyArray<number>> = computed(() => this._state().absent);
    public readonly events: Signal<ReadonlyArray<Readonly<MinorityEvent>>> = computed(() => this._state().events);
    public readonly step: Signal<number> = computed(() => this._state().step);
    public readonly result: Signal<MinorityResult | null> = computed(() => this._state().result);
    /** The players the phase waits for */
    public readonly awaited: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => this.awaitedIn(this._state()));
    public readonly phaseTime: Signal<number> = computed((): number => {
        switch (this._state().phase) {
            case MinorityPhase.ASKING:
                return this.rules.questionTime;
            case MinorityPhase.VOTING:
                return this.setup.voteTime;
            default:
                return this.rules.revealTime;
        }
    });
    /**
     * The question waiting for its asker, drawn by the session: among the players still in and not absent, else every
     * player still in, never the asker of the question before while another player may ask
     */
    public readonly askerDraw: Signal<Readonly<AskerDraw> | null> = computed((): Readonly<AskerDraw> | null => {
        const { phase, asker, alive, absent, lastAsker, round, ask } = this._state();

        if (phase !== MinorityPhase.ASKING || asker !== null) {
            return null;
        }

        const present: ReadonlyArray<number> = without(alive, absent);
        const base: ReadonlyArray<number> = present.length > 0 ? present : alive;
        const others: ReadonlyArray<number> = without(base, lastAsker === null ? [] : [lastAsker]);
        return { round, ask, candidates: others.length > 0 ? others : base };
    });

    /**
     * @param players the number of players, 3 at least
     * @param setup the variant and the seconds of a vote, picked by the player who started the game
     * @param seed the seed of the fair draw of the game, which draws the askers
     */
    public constructor(
        public readonly rules: MinorityRules,
        public readonly players: number,
        public readonly setup: Readonly<MinoritySetup>,
        public readonly seed: string,
    ) {}

    public get variant(): MinorityVariant {
        return this.setup.variant;
    }

    /** The asker drawn for the question */
    public appoint(player: number): Applied {
        const draw: Readonly<AskerDraw> | null = this.askerDraw();

        if (draw?.candidates.includes(player) !== true) {
            return Applied.IGNORED;
        }

        this._state.set({ ...this._state(), asker: player });
        return Applied.APPLIED;
    }

    /** The asker asks its question, checked by the session: the vote opens, the asker back if it was absent */
    public askQuestion(player: number, question: string): Applied {
        const state: Readonly<MinorityState> = this._state();

        if (state.phase !== MinorityPhase.ASKING || state.asker === null) {
            return Applied.IGNORED;
        }
        if (player !== state.asker) {
            return Applied.ILLEGAL;
        }

        this._state.set({
            ...state,
            phase: MinorityPhase.VOTING,
            question,
            absent: without(state.absent, [player]),
            events: [...state.events, { kind: MinorityEventKind.ASKED, round: state.round, asker: player, question }],
            step: state.step + 1,
        });
        return Applied.APPLIED;
    }

    /** A player commits to its vote: a player absent is back */
    public commitVote(player: number): Applied {
        const state: Readonly<MinorityState> = this._state();

        if (state.phase !== MinorityPhase.VOTING || !this.isPlayer(player) || state.committed.includes(player)) {
            return Applied.IGNORED;
        }
        if (!state.alive.includes(player)) {
            return Applied.ILLEGAL;
        }

        this.move({ ...state, committed: [...state.committed, player], absent: without(state.absent, [player]) });
        return Applied.APPLIED;
    }

    /** A player reveals its vote: one neither yes nor no counts as withheld */
    public revealVote(player: number, vote: unknown): Applied {
        const state: Readonly<MinorityState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }
        if (!isVote(vote)) {
            this.miss(player, MissedReason.ILLEGAL);
            return Applied.ILLEGAL;
        }

        this.move({ ...state, settled: [...state.settled, player], votes: [...state.votes, { player, vote }] });
        return Applied.APPLIED;
    }

    /** The reveal of a player did not match its commitment: its vote counts as withheld */
    public refuse(player: number): void {
        if (this.awaitsReveal(this._state(), player)) {
            this.miss(player, MissedReason.INVALID);
        }
    }

    /**
     * The time of the phase is over, and the players it waits for are absent: a late asker gives way to another one, a
     * late voter did not vote, a late reveal withheld its vote. An asker late once every player still in was absent
     * leaves nobody to ask: the question counts no vote, and the game goes on to its end
     */
    public close(): void {
        const state: Readonly<MinorityState> = this._state();
        const late: ReadonlyArray<number> = this.awaitedIn(state);

        if (late.length === 0) {
            return;
        }

        const absent: ReadonlyArray<number> = [...state.absent, ...late];
        switch (state.phase) {
            case MinorityPhase.ASKING: {
                const told: MinorityState = {
                    ...state,
                    absent,
                    events: [...state.events, { kind: MinorityEventKind.ASKER_LATE, round: state.round, asker: state.asker as number }],
                };
                this._state.set(without(state.alive, state.absent).length === 0
                    ? this.counted({ ...told, late: state.alive })
                    : { ...told, ask: state.ask + 1, asker: null, step: state.step + 1 });
                break;
            }
            case MinorityPhase.VOTING:
                this.move({ ...state, late: [...state.late, ...late], absent, events: [...state.events, this.missed(state, MissedReason.LATE, late)] });
                break;
            default:
                this.move({
                    ...state,
                    settled: [...state.settled, ...late],
                    withheld: [...state.withheld, ...late],
                    absent,
                    events: [...state.events, this.missed(state, MissedReason.LATE, late)],
                });
        }
    }

    private initial(): MinorityState {
        return {
            phase: MinorityPhase.ASKING,
            round: 0,
            ask: 0,
            asker: null,
            lastAsker: null,
            question: null,
            alive: this.everyone(),
            committed: [],
            settled: [],
            votes: [],
            late: [],
            withheld: [],
            scores: this.everyone().map(() => 0),
            eliminatedAt: this.everyone().map(() => null),
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

    private awaitsReveal(state: Readonly<MinorityState>, player: number): boolean {
        return state.phase === MinorityPhase.REVEALING && state.committed.includes(player) && !state.settled.includes(player);
    }

    private awaitedIn(state: Readonly<MinorityState>): ReadonlyArray<number> {
        switch (state.phase) {
            case MinorityPhase.ASKING:
                return state.asker === null ? [] : [state.asker];
            case MinorityPhase.VOTING:
                // A vote missed eliminates in the elimination variant: the vote waits for the players absent too
                return without(state.alive, [...state.committed, ...state.late, ...(this.variant === MinorityVariant.SCORE ? state.absent : [])]);
            case MinorityPhase.REVEALING:
                return without(state.committed, state.settled);
            case MinorityPhase.OVER:
                return [];
        }
    }

    private missed(state: Readonly<MinorityState>, reason: MissedReason, players: ReadonlyArray<number>): MinorityEvent {
        return { kind: MinorityEventKind.MISSED, round: state.round, phase: state.phase, reason, players };
    }

    /** A reveal counting as a vote withheld */
    private miss(player: number, reason: MissedReason): void {
        const state: Readonly<MinorityState> = this._state();
        this.move({
            ...state,
            settled: [...state.settled, player],
            withheld: [...state.withheld, player],
            events: [...state.events, this.missed(state, reason, [player])],
        });
    }

    /** A move applied: the phase goes on once it awaits no player */
    private move(state: Readonly<MinorityState>): void {
        this._state.set(this.awaitedIn(state).length > 0 ? state : this.advanced(state));
    }

    /** The vote over: the votes revealed, then counted; nobody committed, counted at once */
    private advanced(state: Readonly<MinorityState>): MinorityState {
        return state.phase === MinorityPhase.VOTING && state.committed.length > 0
            ? { ...state, phase: MinorityPhase.REVEALING, settled: [], step: state.step + 1 }
            : this.counted(state);
    }

    /** The votes counted: the side with the fewest votes is the minority, a tie or one side alone having none */
    private counted(state: Readonly<MinorityState>): MinorityState {
        const votes: ReadonlyArray<Readonly<CastVote>> = this.everyone()
            .map((player: number) => state.votes.find((cast: Readonly<CastVote>) => cast.player === player))
            .filter((cast: Readonly<CastVote> | undefined): cast is Readonly<CastVote> => cast !== undefined);
        const yes: number = votes.filter((cast: Readonly<CastVote>) => cast.vote === Vote.YES).length;
        const no: number = votes.length - yes;
        const outcome: VoteOutcome = this.outcomeOf(yes, no);
        const [fewest, most]: ReadonlyArray<Vote> = yes < no ? [Vote.YES, Vote.NO] : [Vote.NO, Vote.YES];
        const side = (vote: Vote): number[] => outcome === VoteOutcome.MINORITY
            ? votes.filter((cast: Readonly<CastVote>) => cast.vote === vote).map((cast: Readonly<CastVote>) => cast.player)
            : [];
        const majority: ReadonlyArray<number> = side(most);
        const scorers: ReadonlyArray<number> = side(fewest);

        return this.variant === MinorityVariant.ELIMINATION
            ? this.eliminating(state, votes, outcome, majority)
            : this.scoring(state, votes, outcome, scorers, majority.length);
    }

    private outcomeOf(yes: number, no: number): VoteOutcome {
        if (yes + no === 0) {
            return VoteOutcome.NO_VOTE;
        }
        if (yes === no) {
            return VoteOutcome.TIE;
        }
        return yes === 0 || no === 0 ? VoteOutcome.UNANIMOUS : VoteOutcome.MINORITY;
    }

    /**
     * The majority side is eliminated, and every vote missed: a tie or a unanimous vote asks a new question. The game is
     * over once 1 or 2 players are left, or none when no vote counted
     */
    private eliminating(
        state: Readonly<MinorityState>, votes: ReadonlyArray<Readonly<CastVote>>, outcome: VoteOutcome, majority: ReadonlyArray<number>,
    ): MinorityState {
        const out: ReadonlySet<number> = new Set([...state.late, ...state.withheld, ...majority]);
        const eliminated: number[] = state.alive.filter((player: number) => out.has(player));
        const alive: number[] = without(state.alive, eliminated);
        const eliminatedAt: ReadonlyArray<number | null> = state.eliminatedAt.map((round: number | null, player: number) =>
            eliminated.includes(player) ? state.round : round);
        const counted: MinorityState = { ...state, alive, eliminatedAt, events: [...state.events, this.count(state, votes, outcome, eliminated, [])] };

        return alive.length <= 2
            ? { ...counted, phase: MinorityPhase.OVER, result: settleElimination(alive, eliminatedAt, this.rules), step: state.step + 1 }
            : this.next(counted);
    }

    /**
     * Each player of the minority side scores the votes of the majority side; a vote withheld loses the most a question
     * gives, so withholding never pays. The game is over after its rounds
     */
    private scoring(
        state: Readonly<MinorityState>, votes: ReadonlyArray<Readonly<CastVote>>, outcome: VoteOutcome, scorers: ReadonlyArray<number>, gain: number,
    ): MinorityState {
        const points: RoundPoints[] = this.everyone()
            .map((player: number): RoundPoints => ({
                player,
                points: (scorers.includes(player) ? gain : 0) - (state.withheld.includes(player) ? this.players - 1 : 0),
            }))
            .filter((scored: RoundPoints) => scored.points !== 0);
        const scores: number[] = state.scores.map((score: number, player: number) =>
            score + (points.find((scored: RoundPoints) => scored.player === player)?.points ?? 0));
        const counted: MinorityState = { ...state, scores, events: [...state.events, this.count(state, votes, outcome, [], points)] };

        return state.round + 1 >= this.rules.rounds
            ? { ...counted, phase: MinorityPhase.OVER, result: settleScore(scores), step: state.step + 1 }
            : this.next(counted);
    }

    private count(
        state: Readonly<MinorityState>, votes: ReadonlyArray<Readonly<CastVote>>, outcome: VoteOutcome, eliminated: ReadonlyArray<number>,
        points: ReadonlyArray<Readonly<RoundPoints>>,
    ): MinorityEvent {
        return {
            kind: MinorityEventKind.COUNTED, round: state.round, asker: state.asker as number, question: state.question ?? '',
            votes, outcome, eliminated, points,
        };
    }

    /** The next question, its asker to draw */
    private next(state: Readonly<MinorityState>): MinorityState {
        return {
            ...state,
            phase: MinorityPhase.ASKING,
            round: state.round + 1,
            ask: 0,
            asker: null,
            lastAsker: state.asker,
            question: null,
            committed: [],
            settled: [],
            votes: [],
            late: [],
            withheld: [],
            step: state.step + 1,
        };
    }
}
