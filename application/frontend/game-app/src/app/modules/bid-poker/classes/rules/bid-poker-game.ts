import { computed, Signal, signal } from '@angular/core';
import { BidPokerRules } from './bid-poker-rules';
import { BidPokerResult, settle } from './standings';

export enum BidPokerPhase {
    /** The bidders commit to their bids on the lot */
    BIDDING = 'bidding',
    /** The bidders who committed reveal their bids */
    REVEALING = 'revealing',
    /** The players commit to the cards they discard */
    DISCARDING = 'discarding',
    /** The players who committed reveal their discards */
    DISCLOSING = 'disclosing',
    OVER = 'over',
}

/** A lot of cards auctioned: of the dealing session, sold by the bank, or the discards of a player */
export interface Lot {
    /** Its index in its session: its letter */
    readonly index: number;
    /** The indexes of its cards in the deck */
    readonly cards: ReadonlyArray<number>;
    /** The index of the player who discarded it, null for a lot of the bank */
    readonly seller: number | null;
}

export interface Bid {
    readonly player: number;
    readonly amount: number;
}

/** Why a player counted as acting with no bid, or no discard */
export enum MissedReason {
    /** It did not act in time */
    LATE = 'late',
    /** Its reveal did not match its commitment */
    INVALID = 'invalid',
    /** Its bid exceeded its coins, or it discarded a card it does not hold */
    ILLEGAL = 'illegal',
}

export enum BidEventKind {
    SOLD = 'sold',
    UNSOLD = 'unsold',
    DISCARDS = 'discards',
    NO_DISCARD = 'noDiscard',
    MISSED = 'missed',
}

/** What the game told, in the order of the chain: the history of the game */
export type BidEvent =
    | { readonly kind: BidEventKind.SOLD; readonly session: number; readonly lot: number; readonly winner: number; readonly price: number;
        /** The bids revealed, in the order of the commitments */
        readonly bids: ReadonlyArray<Readonly<Bid>>;
        /** The players who bid the price too, after the winner */
        readonly tied: ReadonlyArray<number> }
    | { readonly kind: BidEventKind.UNSOLD; readonly session: number; readonly lot: number; readonly seller: number | null }
    | { readonly kind: BidEventKind.DISCARDS; readonly session: number; readonly player: number; readonly count: number; readonly lot: number }
    | { readonly kind: BidEventKind.NO_DISCARD; readonly session: number }
    | { readonly kind: BidEventKind.MISSED; readonly session: number; readonly lot: number | null; readonly phase: BidPokerPhase;
        readonly reason: MissedReason; readonly players: ReadonlyArray<number> };

/** What a move did */
export enum Applied {
    APPLIED = 'applied',
    /** Against the rules: the session reports it */
    ILLEGAL = 'illegal',
    /** Out of its phase, from a player not awaited, or sent again: the first one counts */
    IGNORED = 'ignored',
}

interface BidPokerState {
    readonly phase: BidPokerPhase;
    /** 0 the dealing session, then the change sessions */
    readonly session: number;
    readonly lots: ReadonlyArray<Readonly<Lot>>;
    readonly lotIndex: number;
    /** The players who committed in the phase, in the order of the chain: the first one wins a tie */
    readonly committed: ReadonlyArray<number>;
    /** The players whose reveal applied, or counts as none */
    readonly settled: ReadonlyArray<number>;
    readonly bids: ReadonlyArray<Readonly<Bid>>;
    /** The cards each player discards, in its order */
    readonly discards: ReadonlyMap<number, ReadonlyArray<number>>;
    readonly coins: ReadonlyArray<number>;
    readonly bank: number;
    readonly holdings: ReadonlyArray<ReadonlyArray<number>>;
    /** The cards of the lots of the dealing session nobody bought */
    readonly out: ReadonlyArray<number>;
    /** The players who let a phase close without acting: no longer awaited, until they commit again */
    readonly absent: ReadonlyArray<number>;
    /**
     * The players who sealed a bid or discards and did not reveal them, in time or as committed: withholding would let
     * them take a value back once they read the others, so they are pigs at the end
     */
    readonly withheld: ReadonlyArray<number>;
    readonly events: ReadonlyArray<Readonly<BidEvent>>;
    /** Counts the moves of the game: a claim of a timeout names the step it waited at */
    readonly step: number;
    readonly result: BidPokerResult | null;
}

const without = (players: ReadonlyArray<number>, others: ReadonlyArray<number>): number[] => players.filter((player: number) => !others.includes(player));

/**
 * The game, in signals, the same on every page: the players act at the same time, their bids and discards sealed, then
 * revealed. Every move applies in the order of the chain; the session checks the commitments, the game the rules.
 *
 * The dealing session auctions the lots of the catalogue one after the other, the coins of a lot going to the bank;
 * each change session, the players discard cards, the discards of each player making a lot, auctioned the same way, the
 * coins going to the player who discarded it. The highest bid wins a lot, the first committed on a tie; a lot nobody
 * bids on leaves the game, or goes back to the player who discarded it.
 */
export class BidPokerGame {
    private readonly _state = signal<Readonly<BidPokerState>>(this.initial());

    public readonly phase: Signal<BidPokerPhase> = computed(() => this._state().phase);
    public readonly session: Signal<number> = computed(() => this._state().session);
    public readonly lots: Signal<ReadonlyArray<Readonly<Lot>>> = computed(() => this._state().lots);
    public readonly lotIndex: Signal<number> = computed(() => this._state().lotIndex);
    /** The lot auctioned, none while the players discard or once the game is over */
    public readonly lot: Signal<Readonly<Lot> | null> = computed((): Readonly<Lot> | null => {
        const { phase, lots, lotIndex } = this._state();
        return phase === BidPokerPhase.BIDDING || phase === BidPokerPhase.REVEALING ? lots[lotIndex] : null;
    });
    public readonly committed: Signal<ReadonlyArray<number>> = computed(() => this._state().committed);
    public readonly coins: Signal<ReadonlyArray<number>> = computed(() => this._state().coins);
    public readonly bank: Signal<number> = computed(() => this._state().bank);
    public readonly holdings: Signal<ReadonlyArray<ReadonlyArray<number>>> = computed(() => this._state().holdings);
    public readonly out: Signal<ReadonlyArray<number>> = computed(() => this._state().out);
    public readonly absent: Signal<ReadonlyArray<number>> = computed(() => this._state().absent);
    public readonly withheld: Signal<ReadonlyArray<number>> = computed(() => this._state().withheld);
    public readonly events: Signal<ReadonlyArray<Readonly<BidEvent>>> = computed(() => this._state().events);
    public readonly step: Signal<number> = computed(() => this._state().step);
    public readonly result: Signal<BidPokerResult | null> = computed(() => this._state().result);
    /** The players the phase waits for */
    public readonly awaited: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => this.awaitedIn(this._state()));
    /** The seconds of the phase: the first lot waits for the players to read the catalogue too */
    public readonly phaseTime: Signal<number> = computed((): number => {
        const { phase, session, lotIndex } = this._state();
        switch (phase) {
            case BidPokerPhase.BIDDING:
                return session === 0 && lotIndex === 0 ? this.rules.catalogueTime + this.rules.bidTime : this.rules.bidTime;
            case BidPokerPhase.DISCARDING:
                return this.rules.discardTime;
            default:
                return this.rules.revealTime;
        }
    });

    /**
     * @param players the number of players
     * @param catalogue the cards of each lot of the dealing session
     */
    public constructor(public readonly rules: BidPokerRules, public readonly players: number, catalogue: ReadonlyArray<ReadonlyArray<number>>) {
        this._state.set(this.opened({
            ...this.initial(),
            lots: catalogue.map((cards: ReadonlyArray<number>, index: number): Lot => ({ index, cards, seller: null })),
        }));
    }

    /** The players who may bid on a lot: all of them but the one who discarded it */
    public bidders(lot: Readonly<Lot>): ReadonlyArray<number> {
        return this.everyone().filter((player: number) => player !== lot.seller);
    }

    /** A player commits to its bid on the lot: a player absent is back */
    public commitBid(player: number): Applied {
        const state: Readonly<BidPokerState> = this._state();
        const lot: Readonly<Lot> = state.lots[state.lotIndex];

        if (state.phase !== BidPokerPhase.BIDDING || !this.isPlayer(player) || state.committed.includes(player)) {
            return Applied.IGNORED;
        }
        if (lot.seller === player) {
            return Applied.ILLEGAL;
        }

        this.move({ ...state, committed: [...state.committed, player], absent: without(state.absent, [player]) });
        return Applied.APPLIED;
    }

    /** A bidder reveals its bid: one above its coins counts as none */
    public revealBid(player: number, amount: number): Applied {
        const state: Readonly<BidPokerState> = this._state();

        if (!this.awaitsReveal(state, BidPokerPhase.REVEALING, player)) {
            return Applied.IGNORED;
        }
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > state.coins[player]) {
            this.miss(player, MissedReason.ILLEGAL);
            return Applied.ILLEGAL;
        }

        this.move({ ...state, settled: [...state.settled, player], bids: [...state.bids, { player, amount }] });
        return Applied.APPLIED;
    }

    /** A player commits to its discards: a player absent is back */
    public commitDiscard(player: number): Applied {
        const state: Readonly<BidPokerState> = this._state();

        if (state.phase !== BidPokerPhase.DISCARDING || !this.isPlayer(player) || state.committed.includes(player)) {
            return Applied.IGNORED;
        }

        this.move({ ...state, committed: [...state.committed, player], absent: without(state.absent, [player]) });
        return Applied.APPLIED;
    }

    /** A player reveals its discards, in its order: a card it does not hold, or twice, counts as no discard */
    public revealDiscard(player: number, cards: ReadonlyArray<number>): Applied {
        const state: Readonly<BidPokerState> = this._state();

        if (!this.awaitsReveal(state, BidPokerPhase.DISCLOSING, player)) {
            return Applied.IGNORED;
        }
        if (new Set(cards).size !== cards.length || cards.some((card: number) => !state.holdings[player].includes(card))) {
            this.miss(player, MissedReason.ILLEGAL);
            return Applied.ILLEGAL;
        }

        this.move({ ...state, settled: [...state.settled, player], discards: new Map([...state.discards, [player, cards]]) });
        return Applied.APPLIED;
    }

    /** The reveal of a player did not match its commitment: it counts as none, its player withholding its value */
    public refuse(player: number): void {
        const state: Readonly<BidPokerState> = this._state();

        if (this.awaitsReveal(state, BidPokerPhase.REVEALING, player) || this.awaitsReveal(state, BidPokerPhase.DISCLOSING, player)) {
            this._state.set({ ...state, withheld: [...state.withheld, player] });
            this.miss(player, MissedReason.INVALID);
        }
    }

    /**
     * The time of the phase is over: the players it waits for act with no bid or no discard, and are absent. The ones who
     * sealed a value and did not reveal it withheld it
     */
    public close(): void {
        const state: Readonly<BidPokerState> = this._state();
        const late: ReadonlyArray<number> = this.awaitedIn(state);

        if (late.length === 0) {
            return;
        }

        const sealed: ReadonlyArray<number> = late.filter((player: number) => state.committed.includes(player));
        const revealing: boolean = state.phase === BidPokerPhase.REVEALING || state.phase === BidPokerPhase.DISCLOSING;
        this.move({
            ...state,
            settled: [...state.settled, ...sealed],
            absent: [...state.absent, ...late],
            withheld: revealing ? [...state.withheld, ...sealed] : state.withheld,
            events: [...state.events, this.missed(state, MissedReason.LATE, late)],
        });
    }

    private initial(): BidPokerState {
        return {
            phase: BidPokerPhase.BIDDING,
            session: 0,
            lots: [],
            lotIndex: 0,
            committed: [],
            settled: [],
            bids: [],
            discards: new Map(),
            coins: this.everyone().map(() => this.rules.coins),
            bank: 0,
            holdings: this.everyone().map(() => []),
            out: [],
            absent: [],
            withheld: [],
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

    private awaitsReveal(state: Readonly<BidPokerState>, phase: BidPokerPhase, player: number): boolean {
        return state.phase === phase && state.committed.includes(player) && !state.settled.includes(player);
    }

    private awaitedIn(state: Readonly<BidPokerState>): ReadonlyArray<number> {
        switch (state.phase) {
            case BidPokerPhase.BIDDING:
                return without(this.bidders(state.lots[state.lotIndex]), [...state.committed, ...state.absent]);
            case BidPokerPhase.DISCARDING:
                // A player without a card has nothing to discard
                return without(this.everyone(), [...state.committed, ...state.absent])
                    .filter((player: number) => state.holdings[player].length > 0);
            case BidPokerPhase.REVEALING:
            case BidPokerPhase.DISCLOSING:
                return without(state.committed, state.settled);
            case BidPokerPhase.OVER:
                return [];
        }
    }

    private missed(state: Readonly<BidPokerState>, reason: MissedReason, players: ReadonlyArray<number>): BidEvent {
        const auction: boolean = state.phase === BidPokerPhase.BIDDING || state.phase === BidPokerPhase.REVEALING;
        return { kind: BidEventKind.MISSED, session: state.session, lot: auction ? state.lotIndex : null, phase: state.phase, reason, players };
    }

    /** A reveal counting as none */
    private miss(player: number, reason: MissedReason): void {
        const state: Readonly<BidPokerState> = this._state();
        this.move({ ...state, settled: [...state.settled, player], events: [...state.events, this.missed(state, reason, [player])] });
    }

    /** A move applied: the phase goes on once it awaits no player */
    private move(state: Readonly<BidPokerState>): void {
        this._state.set(this.awaitedIn(state).length > 0 ? state : this.advanced(state));
    }

    /** The phase over: the bids revealed, then the lot resolved; the discards revealed, then disclosed */
    private advanced(state: Readonly<BidPokerState>): BidPokerState {
        switch (state.phase) {
            case BidPokerPhase.BIDDING:
                return this.awaitedIn({ ...state, phase: BidPokerPhase.REVEALING, settled: [] }).length > 0
                    ? { ...state, phase: BidPokerPhase.REVEALING, settled: [], step: state.step + 1 }
                    : this.resolved(state);
            case BidPokerPhase.REVEALING:
                return this.resolved(state);
            case BidPokerPhase.DISCARDING:
                return this.awaitedIn({ ...state, phase: BidPokerPhase.DISCLOSING, settled: [] }).length > 0
                    ? { ...state, phase: BidPokerPhase.DISCLOSING, settled: [], step: state.step + 1 }
                    : this.disclosed(state);
            default:
                return this.disclosed(state);
        }
    }

    /** The lot goes to the highest bid, the first committed on a tie, or nowhere */
    private resolved(state: Readonly<BidPokerState>): BidPokerState {
        const lot: Readonly<Lot> = state.lots[state.lotIndex];
        const bids: ReadonlyArray<Readonly<Bid>> = state.committed
            .map((player: number) => state.bids.find((bid: Readonly<Bid>) => bid.player === player))
            .filter((bid: Readonly<Bid> | undefined): bid is Readonly<Bid> => bid !== undefined);
        const price: number = Math.max(0, ...bids.map((bid: Readonly<Bid>) => bid.amount));

        if (price === 0) {
            const holdings: ReadonlyArray<ReadonlyArray<number>> = lot.seller === null
                ? state.holdings
                : state.holdings.map((held: ReadonlyArray<number>, player: number) => player === lot.seller ? [...held, ...lot.cards] : held);
            return this.next({
                ...state,
                holdings,
                out: lot.seller === null ? [...state.out, ...lot.cards] : state.out,
                events: [...state.events, { kind: BidEventKind.UNSOLD, session: state.session, lot: lot.index, seller: lot.seller }],
            });
        }

        const [winner, ...tied] = bids.filter((bid: Readonly<Bid>) => bid.amount === price).map((bid: Readonly<Bid>) => bid.player);
        return this.next({
            ...state,
            coins: state.coins.map((coins: number, player: number) => coins - (player === winner ? price : 0) + (player === lot.seller ? price : 0)),
            bank: state.bank + (lot.seller === null ? price : 0),
            holdings: state.holdings.map((held: ReadonlyArray<number>, player: number) => player === winner ? [...held, ...lot.cards] : held),
            events: [...state.events, { kind: BidEventKind.SOLD, session: state.session, lot: lot.index, winner, price, bids, tied }],
        });
    }

    /** The discards of each player, in the order of the players, make the lots of the session */
    private disclosed(state: Readonly<BidPokerState>): BidPokerState {
        const sellers: number[] = this.everyone().filter((player: number) => (state.discards.get(player) ?? []).length > 0);
        const lots: Lot[] = sellers.map((seller: number, index: number): Lot => ({ index, cards: state.discards.get(seller) as ReadonlyArray<number>, seller }));
        const events: BidEvent[] = lots.length === 0
            ? [{ kind: BidEventKind.NO_DISCARD, session: state.session }]
            : lots.map((lot: Lot): BidEvent => ({ kind: BidEventKind.DISCARDS, session: state.session, player: lot.seller as number, count: lot.cards.length, lot: lot.index }));
        const disclosed: BidPokerState = {
            ...state,
            lots,
            lotIndex: -1,
            holdings: state.holdings.map((held: ReadonlyArray<number>, player: number) => without(held, state.discards.get(player) ?? [])),
            events: [...state.events, ...events],
        };

        return this.next(disclosed);
    }

    /** The next lot of the session, else the next change session, else the end of the game */
    private next(state: Readonly<BidPokerState>): BidPokerState {
        const cleared: BidPokerState = { ...state, committed: [], settled: [], bids: [], discards: new Map(), step: state.step + 1 };

        if (state.lotIndex + 1 < state.lots.length) {
            return this.opened({ ...cleared, phase: BidPokerPhase.BIDDING, lotIndex: state.lotIndex + 1 });
        }
        if (state.session < this.rules.changeSessions) {
            return this.opened({ ...cleared, phase: BidPokerPhase.DISCARDING, session: state.session + 1, lots: [], lotIndex: 0 });
        }

        // The bank gets the debts of the players, and the fines no prize paid
        const result: BidPokerResult = settle(state.holdings, state.coins, this.rules, state.withheld);
        return { ...cleared, phase: BidPokerPhase.OVER, result, bank: state.bank + this.players * this.rules.debt + result.unpaid };
    }

    /** A phase opening without any player to wait for (every one absent) is over at once */
    private opened(state: Readonly<BidPokerState>): BidPokerState {
        return this.awaitedIn(state).length > 0 ? state : this.advanced(state);
    }
}
