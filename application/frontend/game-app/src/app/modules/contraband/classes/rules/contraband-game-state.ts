import { computed, Signal, signal } from '@angular/core';
import { Call, CallKind, ContrabandRules, ContrabandSetup, ContrabandVariant, isTrunk } from './contraband-rules';
import { Movement, settleCall, withheldMovement } from './customs';
import { Crossing } from './schedule';
import { accountOf, ContrabandResult, Ledger, settleContraband } from './standings';

export enum ContrabandPhase {
    /** The smuggler seals its trunk */
    PACKING = 'packing',
    /** The customs are open: the inspector calls */
    CUSTOMS = 'customs',
    /** The smuggler reveals its trunk */
    REVEALING = 'revealing',
    OVER = 'over',
}

/** Why a trunk counts as withheld */
export enum WithheldReason {
    /** The smuggler did not reveal it in time */
    LATE = 'late',
    /** Its reveal did not match its commitment */
    INVALID = 'invalid',
    /** It revealed a trunk the rules do not allow */
    ILLEGAL = 'illegal',
}

export enum ContrabandEventKind {
    PACKED = 'packed',
    /** The smuggler did not pack in time: nothing moved, the next game starts */
    PACK_LATE = 'packLate',
    CALLED = 'called',
    SETTLED = 'settled',
}

/** What the match told, in the order of the chain: the history of the match */
export type ContrabandEvent =
    | { readonly kind: ContrabandEventKind.PACKED | ContrabandEventKind.PACK_LATE; readonly crossing: number; readonly smuggler: number;
        readonly inspector: number }
    | { readonly kind: ContrabandEventKind.CALLED; readonly crossing: number; readonly smuggler: number; readonly inspector: number;
        readonly call: Call }
    | { readonly kind: ContrabandEventKind.SETTLED; readonly crossing: number; readonly smuggler: number; readonly inspector: number;
        readonly call: Call;
        /** The inspector did not call in time: its pass was no choice of its own */
        readonly lateCall: boolean;
        /** The money of the trunk revealed, none for a trunk withheld */
        readonly contents: number | null;
        readonly movement: Movement;
        /** Why the trunk counts as withheld, none for a trunk revealed */
        readonly reason: WithheldReason | null };

/** What a move did */
export enum Applied {
    APPLIED = 'applied',
    /** Against the rules: the session reports it */
    ILLEGAL = 'illegal',
    /** Out of its phase, from a player not awaited, or sent again: the first one counts */
    IGNORED = 'ignored',
}

interface ContrabandState {
    readonly phase: ContrabandPhase;
    /** The index of the game in the match */
    readonly crossing: number;
    /** The call of the inspector, once called */
    readonly call: Call | null;
    /** The inspector did not call in time: its call is a pass */
    readonly lateCall: boolean;
    /** The money of each player, in the order of their seats */
    readonly ledgers: ReadonlyArray<Readonly<Ledger>>;
    /** The players who let a phase close without acting: a page gives no more time to a phase waiting for them away, until they act again */
    readonly absent: ReadonlyArray<number>;
    readonly events: ReadonlyArray<Readonly<ContrabandEvent>>;
    /** Counts the phases of the match: a claim of a timeout names the step it waited at */
    readonly step: number;
    readonly result: ContrabandResult | null;
}

/**
 * The match, in signals, the same on every page: in each game of the schedule drawn, a smuggler seals a trunk, the
 * inspector of the other country calls, then the smuggler reveals its trunk, the call settling the money. Every move
 * applies in the order of the chain; the session checks the commitments and the calls, the game the rules.
 *
 * A player late gets its worst case: a smuggler not packing moves nothing, an inspector not calling passes the trunk, a
 * trunk not revealed is seized at the most it could hold.
 */
export class ContrabandGameState {
    private readonly _state = signal<Readonly<ContrabandState>>(this.initial());

    public readonly phase: Signal<ContrabandPhase> = computed(() => this._state().phase);
    public readonly crossing: Signal<number> = computed(() => this._state().crossing);
    public readonly smuggler: Signal<number> = computed(() => this.schedule[this._state().crossing].smuggler);
    public readonly inspector: Signal<number> = computed(() => this.schedule[this._state().crossing].inspector);
    /** The call of the inspector in the game, once called */
    public readonly inspectorCall: Signal<Call | null> = computed(() => this._state().call);
    /** The money left in the ATM of each player */
    public readonly atms: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> =>
        this._state().ledgers.map((ledger: Readonly<Ledger>) => ledger.atm));
    /** The money on the account of each player in the third country */
    public readonly accounts: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> =>
        this._state().ledgers.map((ledger: Readonly<Ledger>) => accountOf(this.rules, ledger)));
    public readonly absent: Signal<ReadonlyArray<number>> = computed(() => this._state().absent);
    public readonly events: Signal<ReadonlyArray<Readonly<ContrabandEvent>>> = computed(() => this._state().events);
    public readonly step: Signal<number> = computed(() => this._state().step);
    public readonly result: Signal<ContrabandResult | null> = computed(() => this._state().result);
    /** The players the phase waits for */
    public readonly awaited: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => this.awaitedIn(this._state()));
    public readonly phaseTime: Signal<number> = computed((): number => {
        switch (this._state().phase) {
            case ContrabandPhase.PACKING:
                return this.rules.packingTime;
            case ContrabandPhase.CUSTOMS:
                return this.setup.customsTime;
            default:
                return this.rules.revealTime;
        }
    });

    /**
     * @param north the players of each country: the North ones first in the order of the seats
     * @param setup the variant, the seconds of the customs and the games, picked by the player who started the match
     * @param schedule the games of the match, drawn from its seed: one per game of the setup
     */
    public constructor(
        public readonly rules: ContrabandRules,
        public readonly north: number,
        public readonly setup: Readonly<ContrabandSetup>,
        public readonly schedule: ReadonlyArray<Readonly<Crossing>>,
    ) {}

    public get variant(): ContrabandVariant {
        return this.setup.variant;
    }

    /** The players of both countries */
    public get players(): number {
        return 2 * this.north;
    }

    /** The smuggler sealed its trunk: the customs open, the smuggler back if it was absent */
    public pack(player: number): Applied {
        const state: Readonly<ContrabandState> = this._state();

        if (state.phase !== ContrabandPhase.PACKING || !this.isPlayer(player)) {
            return Applied.IGNORED;
        }
        if (player !== this.smuggler()) {
            return Applied.ILLEGAL;
        }

        this._state.set({
            ...state,
            phase: ContrabandPhase.CUSTOMS,
            absent: without(state.absent, player),
            events: [...state.events, { kind: ContrabandEventKind.PACKED, ...this.duel(state) }],
            step: state.step + 1,
        });
        return Applied.APPLIED;
    }

    /** The inspector calls, its call checked by the session: the smuggler reveals its trunk, the inspector back if it was absent */
    public call(player: number, call: Call): Applied {
        const state: Readonly<ContrabandState> = this._state();

        if (state.phase !== ContrabandPhase.CUSTOMS || !this.isPlayer(player)) {
            return Applied.IGNORED;
        }
        if (player !== this.inspector()) {
            return Applied.ILLEGAL;
        }

        this._state.set(this.called({ ...state, absent: without(state.absent, player) }, call, false));
        return Applied.APPLIED;
    }

    /** The smuggler reveals its trunk, matching its commitment: one the rules do not allow counts as withheld */
    public reveal(player: number, contents: unknown): Applied {
        const state: Readonly<ContrabandState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }
        if (!isTrunk(this.rules, this.variant, state.ledgers[player].atm, contents)) {
            this._state.set(this.withheld(state, WithheldReason.ILLEGAL));
            return Applied.ILLEGAL;
        }

        this._state.set(this.settled({ ...state, absent: without(state.absent, player) }, contents, settleCall(this.rules, contents, state.call as Call), null));
        return Applied.APPLIED;
    }

    /** The reveal of the smuggler did not match its commitment: its trunk counts as withheld */
    public refuse(player: number): Applied {
        const state: Readonly<ContrabandState> = this._state();

        if (!this.awaitsReveal(state, player)) {
            return Applied.IGNORED;
        }

        this._state.set(this.withheld(state, WithheldReason.INVALID));
        return Applied.APPLIED;
    }

    /**
     * The time of the phase is over, and the player it waits for is absent: a smuggler late packs nothing, the next game
     * starting; an inspector late passes the trunk; a trunk revealed late counts as withheld
     */
    public close(): Applied {
        const state: Readonly<ContrabandState> = this._state();
        const [late] = this.awaitedIn(state);

        if (late === undefined) {
            return Applied.IGNORED;
        }

        const absent: ReadonlyArray<number> = state.absent.includes(late) ? state.absent : [...state.absent, late];
        switch (state.phase) {
            case ContrabandPhase.PACKING:
                this._state.set(this.next({ ...state, absent, events: [...state.events, { kind: ContrabandEventKind.PACK_LATE, ...this.duel(state) }] }));
                break;
            case ContrabandPhase.CUSTOMS:
                this._state.set(this.called({ ...state, absent }, { kind: CallKind.PASS }, true));
                break;
            default:
                this._state.set(this.withheld({ ...state, absent }, WithheldReason.LATE));
        }
        return Applied.APPLIED;
    }

    private initial(): ContrabandState {
        return {
            phase: ContrabandPhase.PACKING,
            crossing: 0,
            call: null,
            lateCall: false,
            ledgers: Array.from({ length: this.players }, (): Ledger => ({ atm: this.rules.atm, smuggled: 0, seized: 0, indemnities: 0 })),
            absent: [],
            events: [],
            step: 0,
            result: null,
        };
    }

    private isPlayer(player: number): boolean {
        return Number.isInteger(player) && player >= 0 && player < this.players;
    }

    private duel(state: Readonly<ContrabandState>): { readonly crossing: number; readonly smuggler: number; readonly inspector: number } {
        return { crossing: state.crossing, ...this.schedule[state.crossing] };
    }

    private awaitsReveal(state: Readonly<ContrabandState>, player: number): boolean {
        return state.phase === ContrabandPhase.REVEALING && player === this.schedule[state.crossing].smuggler;
    }

    private awaitedIn(state: Readonly<ContrabandState>): ReadonlyArray<number> {
        const { smuggler, inspector } = this.schedule[state.crossing];
        switch (state.phase) {
            case ContrabandPhase.PACKING:
            case ContrabandPhase.REVEALING:
                return [smuggler];
            case ContrabandPhase.CUSTOMS:
                return [inspector];
            case ContrabandPhase.OVER:
                return [];
        }
    }

    private called(state: Readonly<ContrabandState>, call: Call, late: boolean): ContrabandState {
        return {
            ...state,
            phase: ContrabandPhase.REVEALING,
            call,
            lateCall: late,
            events: [...state.events, { kind: ContrabandEventKind.CALLED, ...this.duel(state), call }],
            step: state.step + 1,
        };
    }

    /** A trunk not revealed: the most it could hold is seized */
    private withheld(state: Readonly<ContrabandState>, reason: WithheldReason): ContrabandState {
        const { smuggler } = this.schedule[state.crossing];
        return this.settled(state, null, withheldMovement(this.rules, this.variant, state.ledgers[smuggler].atm), reason);
    }

    /** The money of the game moved, then the next game */
    private settled(state: Readonly<ContrabandState>, contents: number | null, movement: Movement, reason: WithheldReason | null): ContrabandState {
        const { smuggler, inspector } = this.schedule[state.crossing];
        const ledgers: ReadonlyArray<Readonly<Ledger>> = state.ledgers.map((ledger: Readonly<Ledger>, player: number): Readonly<Ledger> => {
            if (player === smuggler) {
                return {
                    ...ledger,
                    atm: ledger.atm - movement.fromAtm,
                    smuggled: ledger.smuggled + movement.smuggled,
                    indemnities: ledger.indemnities + movement.indemnity,
                };
            }
            return player === inspector ? { ...ledger, seized: ledger.seized + movement.seized, indemnities: ledger.indemnities - movement.indemnity } : ledger;
        });

        return this.next({
            ...state,
            ledgers,
            events: [...state.events, {
                kind: ContrabandEventKind.SETTLED, ...this.duel(state), call: state.call as Call, lateCall: state.lateCall, contents, movement, reason,
            }],
        });
    }

    /** The next game, or the end of the match after its games */
    private next(state: Readonly<ContrabandState>): ContrabandState {
        if (state.crossing + 1 >= this.setup.games) {
            return {
                ...state,
                phase: ContrabandPhase.OVER,
                call: null,
                lateCall: false,
                result: settleContraband(this.rules, this.north, state.ledgers),
                step: state.step + 1,
            };
        }
        return { ...state, phase: ContrabandPhase.PACKING, crossing: state.crossing + 1, call: null, lateCall: false, step: state.step + 1 };
    }
}

function without(players: ReadonlyArray<number>, player: number): number[] {
    return players.filter((other: number) => other !== player);
}
