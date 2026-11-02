import { computed, Signal, signal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { commitmentOf, CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { DrawPhase, DrawStep, FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SealedCommitments } from '@app/modules/commit-reveal/classes/sealed-commitments';
import { SealedStore } from '@app/modules/commit-reveal/classes/sealed-store';
import { SeatedPlayer, TableSeats } from '@app/modules/game-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Observable, Subject, Subscription } from 'rxjs';
import { Applied, BidPokerGame, BidPokerPhase, Lot } from '../rules/bid-poker-game';
import { BID_POKER_RULES, BidPokerRules } from '../rules/bid-poker-rules';
import { drawCatalogue } from '../rules/catalogue';
import {
    BidCommitMessage, BidDiscardMessage, BidDrawMessage, BidPokerMessage, BidPokerPayloads, BidRevealMessage, BidRound, BidTimeoutMessage,
    BPGameSessionType,
} from './bid-poker-messages';
import { PlayedBidGame } from './played-bid-game';

export interface BidPokerSessionOptions {
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: BidPokerRules;
}

/** A value the local player committed to, kept to reveal it: a bid, or discards */
interface Seal {
    /** The session and the lot, `discard` for the discards */
    readonly round: string;
    readonly value: number | ReadonlyArray<number>;
    readonly salt: string;
}

/** The steps of the draw before the game: its commitments, then its reveals */
const DRAW_STEPS: number = 2;
/**
 * The seconds a claim of a timeout may come before the end of the time of its phase, on the time of the chain: the
 * clocks of the pages start once they receive the block opening the phase
 */
const CLAIM_SLACK: number = 2;
const ROUND_OF_DISCARDS: string = 'discard';

const isSafeIntegers = (values: unknown): values is ReadonlyArray<number> =>
    Array.isArray(values) && values.every((value: unknown) => Number.isSafeInteger(value));

/**
 * The Bid Poker in a room. The participants take the seats themselves; a seated player starts the game once 4 players
 * or more are seated: the seats are final until it is over. The players draw the deck at once, each one committing to a
 * random part then revealing it: the seed shuffles the deck and cuts it into the lots of the catalogue, alike on every
 * page. Then the lots are auctioned one after the other, the players bidding at the same time: each one commits to its
 * bid, 0 for none, and reveals it once every bidder committed. No participant, the sequencer included, reads a bid before
 * the bidding of its lot is closed; the first commitment in the chain wins a tie.
 *
 * A phase closes as soon as every player it waits for acted, else once its time is over: a player claims it, the first
 * claim in the chain counting, and the players it waited for act with no bid or no discard. A claim coming before the
 * time of the phase, on the time of the chain, is void.
 */
export class BidPokerSession {
    public readonly rules: BidPokerRules = this.options.rules ?? BID_POKER_RULES;

    private readonly _played = signal<PlayedBidGame>(new PlayedBidGame(0, 0));
    /** The game in progress, else the latest */
    public readonly played: Signal<PlayedBidGame> = this._played.asReadonly();
    private readonly _pastGames = signal<ReadonlyArray<PlayedBidGame>>([]);
    /** The games over before the one in progress, the first one first */
    public readonly pastGames: Signal<ReadonlyArray<PlayedBidGame>> = this._pastGames.asReadonly();
    /** The game, once its deck is drawn */
    public readonly game: Signal<BidPokerGame | null> = computed((): BidPokerGame | null => this._played().game());

    private readonly _sending = signal<boolean>(false);
    /** A move of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** A player started the game: its players are final until it is over */
    public readonly started: Signal<boolean> = computed((): boolean => this._played().players().length > 0);
    public readonly over: Signal<boolean> = computed((): boolean => this._played().result() !== null);
    /** The seats are open until the game starts, and once it is over */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => !this.started() || this.over());

    public readonly tableSeats = new TableSeats(this.room, {
        count: this.rules.seats,
        types: { seat: BPGameSessionType.SEAT, unseat: BPGameSessionType.UNSEAT },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The seated players not connected: the seats are the players of the game while it is played */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;
    /** The players of the game, the seated ones in the order of their seats until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => this.started()
        ? this._played().players()
        : this.tableSeats.taken().map((player: Readonly<SeatedPlayer>) => player.name));
    /** The index of the local player among the players, none for a spectator */
    public readonly myIndex: Signal<number | null> = computed((): number | null => this.indexOf(this.room.localPlayer.name));
    /** The local player plays the game in progress: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over());

    /** The players the game waits for: to draw the deck, then to act in each phase */
    public readonly awaited: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const game: BidPokerGame | null = this.game();
        if (game === null) {
            return this._played().drawWaitingFor();
        }
        return game.awaited().map((player: number) => this.players()[player]);
    });
    /** The moves of the game: a claim of a timeout names it, a move closing the phase meanwhile voids it */
    public readonly step: Signal<number> = computed((): number => {
        const game: BidPokerGame | null = this.game();
        return game === null ? Number(this._played().drawPhase() === DrawPhase.REVEALING) : DRAW_STEPS + game.step();
    });
    /** The seconds of the phase in progress */
    public readonly phaseTime: Signal<number> = computed((): number => this.game()?.phaseTime() ?? this.rules.drawTime);

    /** Whether the local player may start the game: seated, with enough players, none started */
    public readonly canStart: Signal<boolean> = computed((): boolean => !this._sending() && !this.started()
        && this.tableSeats.mySeat() !== null && this.tableSeats.taken().length >= this.rules.minPlayers);
    /** Whether the local player may bid on the lot: a bidder not committed yet */
    public readonly canBid: Signal<boolean> = computed((): boolean => {
        const game: BidPokerGame | null = this.game();
        const me: number | null = this.myIndex();
        const lot: Readonly<Lot> | null = game?.lot() ?? null;
        return !this._sending() && me !== null && game?.phase() === BidPokerPhase.BIDDING && lot !== null
            && game.bidders(lot).includes(me) && !game.committed().includes(me);
    });
    /** Whether the local player may discard: holding cards, not committed yet */
    public readonly canDiscard: Signal<boolean> = computed((): boolean => {
        const game: BidPokerGame | null = this.game();
        const me: number | null = this.myIndex();
        return !this._sending() && me !== null && game?.phase() === BidPokerPhase.DISCARDING
            && game.holdings()[me].length > 0 && !game.committed().includes(me);
    });

    private readonly _seals = signal<ReadonlyMap<string, Readonly<Seal>>>(new Map());
    /** The bid of the local player on the lot auctioned, sealed until the bidding closes */
    public readonly myBid: Signal<number | null> = computed((): number | null => {
        const game: BidPokerGame | null = this.game();
        const lot: Readonly<Lot> | null = game?.lot() ?? null;
        const seal: Readonly<Seal> | undefined = lot === null ? undefined : this._seals().get(`${ (game as BidPokerGame).session() }:${ lot.index }`);
        return typeof seal?.value === 'number' ? seal.value : null;
    });
    /** The discards of the local player in the change session, sealed until the discarding closes */
    public readonly myDiscards: Signal<ReadonlyArray<number> | null> = computed((): ReadonlyArray<number> | null => {
        const game: BidPokerGame | null = this.game();
        const seal: Readonly<Seal> | undefined = game === null ? undefined : this._seals().get(`${ game.session() }:${ ROUND_OF_DISCARDS }`);
        return Array.isArray(seal?.value) ? seal.value : null;
    });

    private readonly _voidedClaims = signal<number>(0);
    /** The claims of the local player voided as too early: its clock waits again */
    public readonly voidedClaims: Signal<number> = this._voidedClaims.asReadonly();
    private readonly _catalogues = signal<number>(0);
    /** The catalogues drawn live, out of the history of the room: each one is heard */
    public readonly catalogues: Signal<number> = this._catalogues.asReadonly();
    private readonly _liveEvents = signal<number>(0);
    /** The events of the game told live: the table hears the latest ones */
    public readonly liveEvents: Signal<number> = this._liveEvents.asReadonly();
    // The session applied a live message: it caught up with the history of the room
    private live: boolean = false;
    private readonly _caughtUp = new Subject<void>();
    /** Emits once, right before the first live message applies: the table shows the history at once */
    public readonly caughtUp: Observable<void> = this._caughtUp.asObservable();

    /** The commitments of the game in progress, by round */
    private commitments = new SealedCommitments<string>();
    private seals?: SealedStore<Seal>;
    private parts?: SealedStore<string>;
    /** What the local player sent in this page, once: a reveal sent again after a reload is ignored by the others */
    private readonly sent = new Set<string>();
    /** The time of the chain the phase in progress opened at */
    private openedAt: number = 0;
    private readonly subscription: Subscription;
    /** The messages apply one after the other, in the order of the chain: a reveal checks its commitment first */
    private queue: Promise<void> = Promise.resolve();
    private pending: number = 0;

    public constructor(private readonly room: Room<BidPokerPayloads>, private readonly options: BidPokerSessionOptions = {}) {
        this.subscription = merge(...Object.values(BPGameSessionType).map((type: BPGameSessionType) => room.messenger(type)))
            .subscribe((message: BidPokerMessage) => {
                this.pending++;
                const history: boolean = room.isHistory(message);
                this.queue = this.queue.then(async () => {
                    if (!history && !this.live) {
                        this.live = true;
                        this._caughtUp.next();
                    }
                    const step: string = this.stepKey();
                    const events: number = this.game()?.events().length ?? 0;
                    await logHandlingFailure(message, this.apply(message));
                    if (this.stepKey() !== step) {
                        this.openedAt = room.sequencedAt(message) ?? 0;
                    }
                    if (!history) {
                        this._liveEvents.update((count: number) => count + Math.max(0, (this.game()?.events().length ?? 0) - events));
                    }
                    // Once the messages received are applied, as a reloaded page catching up: the page acts on the chain
                    if (--this.pending === 0) {
                        await this.act();
                    }
                });
            });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
    }

    public takeSeat(seat: number): void {
        this.tableSeats.takeSeat(seat);
    }

    public leaveSeat(): void {
        this.tableSeats.leaveSeat();
    }

    /** A seated player frees the seat of another one, away */
    public unseat(seat: number): void {
        this._sending.set(true);
        this.tableSeats.unseat(seat);
    }

    /** The local player starts the game with the seated players: then each one commits to its part of the draw of the deck */
    public start(): void {
        if (this.canStart()) {
            this._sending.set(true);
            this.room.transmitMessage(BPGameSessionType.DRAW, { ...this.round(), players: this.players() });
        }
    }

    /** The local player bids on the lot, 0 for no bid: sealed until the bidding closes */
    public async bid(amount: number): Promise<void> {
        const game: BidPokerGame | null = this.game();
        if (game === null || !this.canBid()) {
            return;
        }
        await this.seal(`${ game.session() }:${ game.lotIndex() }`, amount, game.lotIndex());
    }

    /** The local player discards cards, in its order, none to keep its cards: sealed until the discarding closes */
    public async discard(cards: ReadonlyArray<number>): Promise<void> {
        const game: BidPokerGame | null = this.game();
        if (game === null || !this.canDiscard()) {
            return;
        }
        await this.seal(`${ game.session() }:${ ROUND_OF_DISCARDS }`, cards, null);
    }

    /**
     * The time of the phase is over: the players it waits for act with no bid or no discard
     *
     * @param step the step of the phase whose time is over: a claim of a phase closed meanwhile is void
     */
    public claimTimeout(step: number = this.step()): void {
        this._sending.set(true);
        this.room.transmitMessage(BPGameSessionType.TIMEOUT, { ...this.round(), step });
    }

    /** A player of the game over starts a new one */
    public rematch(): void {
        this._sending.set(true);
        this.room.transmitMessage(BPGameSessionType.REMATCH, { game: this._pastGames().length + 1 });
    }

    private get sealStore(): SealedStore<Seal> {
        this.seals ??= new SealedStore<Seal>('bids', this.room.roomName, this.room.localPlayer.name);
        return this.seals;
    }

    private get partStore(): SealedStore<string> {
        this.parts ??= new SealedStore<string>('draws', this.room.roomName, this.room.localPlayer.name);
        return this.parts;
    }

    private round(): BidRound {
        return { game: this._played().index, attempt: this._played().attempt };
    }

    private stepKey(): string {
        return `${ this._played().index }:${ this._played().attempt }:${ this.started() }:${ this.step() }`;
    }

    private indexOf(name: string): number | null {
        const index: number = this.players().indexOf(name);
        return index === -1 ? null : index;
    }

    /** The commitment to a value: the game, the player, the round and the value, with a salt */
    private preimage(round: string, value: number | ReadonlyArray<number>, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        const kind: string = typeof value === 'number' ? 'bid' : ROUND_OF_DISCARDS;
        return [this._played().id(), kind, player, round, typeof value === 'number' ? value : JSON.stringify(value), salt];
    }

    /** Stores the value before committing to it: a reload reveals it */
    private async seal(round: string, value: number | ReadonlyArray<number>, lot: number | null): Promise<void> {
        const game: BidPokerGame = this.game() as BidPokerGame;
        const salt: string = drawSalt();
        this._sending.set(true);
        this._seals.update((seals: ReadonlyMap<string, Readonly<Seal>>) => new Map([...seals, [round, { round, value, salt }]]));
        const commitment: string = await commitmentOf(this.preimage(round, value, salt, this.myIndex() as number), ':');
        this.sealStore.save(commitment, { round, value, salt });
        this.room.transmitMessage(BPGameSessionType.COMMIT, { ...this.round(), session: game.session(), lot, commitment });
    }

    private isRound(payload: BidRound): boolean {
        return payload.game === this._played().index && payload.attempt === this._played().attempt;
    }

    private async apply(message: BidPokerMessage): Promise<void> {
        // The move of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== BPGameSessionType.SEAT) {
            this._sending.set(false);
        }

        switch (message.type) {
            case BPGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case BPGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
            case BPGameSessionType.DRAW:
                await this.onDraw(message);
                break;
            case BPGameSessionType.COMMIT:
                this.onCommit(message);
                break;
            case BPGameSessionType.REVEAL:
                await this.onReveal(message);
                break;
            case BPGameSessionType.DISCARD:
                await this.onDiscard(message);
                break;
            case BPGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case BPGameSessionType.REMATCH:
                this.onRematch(message.from, message.payload.game);
                break;
        }
    }

    /**
     * A seated player starts the game with the seated players it names, 4 at least: a start naming others is void, a
     * seat changed meanwhile. Then each player commits to its random part, and reveals it once every one committed
     */
    private async onDraw(message: AppMessage<BPGameSessionType.DRAW, BidDrawMessage>): Promise<void> {
        const { players, commitment, part } = message.payload;

        if (!this.isRound(message.payload)) {
            return;
        }
        if (players !== undefined) {
            this.open(message.from, players);
            return;
        }
        if (!this.started() || this.game() !== null) {
            return;
        }

        const draw: FairDraw = this._played().draw as FairDraw;
        const step: DrawStep = part === undefined ? draw.commit(message.from, commitment) : await draw.reveal(message.from, part);
        if (step === DrawStep.INVALID) {
            this.room.reportCheat(message, part === undefined ? CheatReason.INVALID_MESSAGE : CheatReason.INVALID_REVEAL);
        }
        this._played().drew();

        const seed: string | undefined = await draw.seed();
        if (seed !== undefined) {
            this._played().start(new BidPokerGame(this.rules, draw.players.length, await drawCatalogue(seed, this.rules)));
            if (!this.room.isHistory(message)) {
                this._catalogues.update((count: number) => count + 1);
            }
        }
    }

    /** The game starts with the seated players, the ones the start names: its draw opens, with the salts of the players */
    private open(from: string, players: unknown): void {
        const seated: ReadonlyArray<Readonly<SeatedPlayer>> = this.tableSeats.taken();
        const names: ReadonlyArray<string> = seated.map((player: Readonly<SeatedPlayer>) => player.name);

        if (!this.started() && Array.isArray(players) && players.join('\n') === names.join('\n') && names.includes(from) && names.length >= this.rules.minPlayers) {
            this._played().open(seated);
        }
    }

    /** A player commits to its bid or its discards: the first commitment counts */
    private onCommit(message: AppMessage<BPGameSessionType.COMMIT, BidCommitMessage>): void {
        const game: BidPokerGame | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { session, lot, commitment } = message.payload;

        if (game === null || player === null || !this.isRound(message.payload) || session !== game.session()) {
            return;
        }
        if (!isCommitment(commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }

        const discards: boolean = lot === null;
        if (!discards && lot !== game.lotIndex()) {
            return;
        }
        const applied: Applied = discards ? game.commitDiscard(player) : game.commitBid(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        if (applied === Applied.APPLIED) {
            this.commitments.record(`${ session }:${ discards ? ROUND_OF_DISCARDS : lot }`, message.from, commitment);
            this.restore(message.from, commitment);
        }
    }

    /**
     * The value of a commitment of the local player, kept in the tab: its page was reloaded, or sealed another value
     * meanwhile, the first commitment in the chain counting
     */
    private restore(from: string, commitment: string): void {
        const stored: Readonly<Seal> | undefined = from === this.room.localPlayer.name ? this.sealStore.get(commitment) : undefined;

        if (stored !== undefined) {
            this._seals.update((seals: ReadonlyMap<string, Readonly<Seal>>) => new Map([...seals, [stored.round, stored]]));
        }
    }

    /** Whether a revealed value matches the commitment of its player: else the reveal is reported, and counts as none */
    private async matches(message: BidPokerMessage, round: string, value: number | ReadonlyArray<number>, salt: unknown, player: number): Promise<boolean> {
        const matching: boolean = typeof salt === 'string'
            && this.commitments.get(round, message.from) === await commitmentOf(this.preimage(round, value, salt, player), ':');

        if (!matching) {
            this.room.reportCheat(message, CheatReason.INVALID_REVEAL);
            this.game()?.refuse(player);
        }
        return matching;
    }

    private async onReveal(message: AppMessage<BPGameSessionType.REVEAL, BidRevealMessage>): Promise<void> {
        const game: BidPokerGame | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { session, lot, amount, salt } = message.payload;

        if (game?.phase() !== BidPokerPhase.REVEALING || player === null || !this.isRound(message.payload) || session !== game.session()
            || lot !== game.lotIndex() || !game.awaited().includes(player)) {
            return;
        }

        const round: string = `${ session }:${ lot }`;
        if (!await this.matches(message, round, typeof amount === 'number' ? amount : Number.NaN, salt, player)) {
            return;
        }
        this.revealed(message.from, round);
        if (game.revealBid(player, amount) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    private async onDiscard(message: AppMessage<BPGameSessionType.DISCARD, BidDiscardMessage>): Promise<void> {
        const game: BidPokerGame | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { session, cards, salt } = message.payload;

        if (game?.phase() !== BidPokerPhase.DISCLOSING || player === null || !this.isRound(message.payload) || session !== game.session()
            || !game.awaited().includes(player)) {
            return;
        }

        const round: string = `${ session }:${ ROUND_OF_DISCARDS }`;
        const discarded: ReadonlyArray<number> = isSafeIntegers(cards) ? cards : [Number.NaN];
        if (!await this.matches(message, round, discarded, salt, player)) {
            return;
        }
        this.revealed(message.from, round);
        if (game.revealDiscard(player, discarded) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /** A value of the local player revealed in the chain: a reload does not need it anymore */
    private revealed(from: string, round: string): void {
        const commitment: string | undefined = this.commitments.get(round, from);
        if (from === this.room.localPlayer.name && commitment !== undefined) {
            this.sealStore.remove(commitment);
        }
    }

    /**
     * A player of the game tells the time of the phase is over, the first claim in the chain counting: a claim naming a
     * step past, or coming before the time of the phase on the time of the chain, is void. The draw of the deck over,
     * its late players lose their seats and the seats open again, for a new attempt; else they act with no bid or no
     * discard
     */
    private onTimeout(message: AppMessage<BPGameSessionType.TIMEOUT, BidTimeoutMessage>): void {
        // A room without the time of a chain can not tell a claim too early
        const at: number | undefined = this.room.sequencedAt(message);

        if (this.indexOf(message.from) === null || !this.started() || !this.isRound(message.payload) || message.payload.step !== this.step()
            || this.awaited().length === 0) {
            return;
        }
        if (at !== undefined && at - this.openedAt < (this.phaseTime() - CLAIM_SLACK) * 1000) {
            if (message.from === this.room.localPlayer.name) {
                this._voidedClaims.update((count: number) => count + 1);
            }
            return;
        }

        const game: BidPokerGame | null = this.game();
        if (game !== null) {
            game.close();
            return;
        }

        this.awaited().forEach((late: string) => this.tableSeats.free(this.tableSeats.seatOf(late) as number));
        this._played.set(new PlayedBidGame(this._played().index, this._played().attempt + 1));
    }

    /**
     * A seated player starts a new game once the former one is over, its seats open: the first request starts it, the
     * others name a game started already. The new game has its own commitments and seals
     */
    private onRematch(from: string, game: number): void {
        if (this.tableSeats.seatOf(from) === null || !this.over() || game !== this._pastGames().length + 1) {
            return;
        }

        this._pastGames.update((games: ReadonlyArray<PlayedBidGame>) => [...games, this._played()]);
        this._played.set(new PlayedBidGame(game, 0));
        this.commitments = new SealedCommitments<string>();
        this._seals.set(new Map());
    }

    /**
     * What the local player owes the chain once the messages received are applied: its random part of the draw, its
     * commitment then its reveal, and its reveals of its bids and discards. A page reloaded acts from its tab
     */
    private async act(): Promise<void> {
        const me: number | null = this.myIndex();
        const played: PlayedBidGame = this._played();
        const draw: FairDraw | null = played.draw;
        const game: BidPokerGame | null = this.game();

        if (me === null || draw === null) {
            return;
        }
        if (game === null) {
            await this.actOnDraw(draw, me);
            return;
        }

        const phase: BidPokerPhase = game.phase();
        if (game.awaited().includes(me) && (phase === BidPokerPhase.REVEALING || phase === BidPokerPhase.DISCLOSING)) {
            const round: string = `${ game.session() }:${ phase === BidPokerPhase.REVEALING ? game.lotIndex() : ROUND_OF_DISCARDS }`;
            const seal: Readonly<Seal> | undefined = this._seals().get(round);
            const key: string = `${ played.id() }:${ round }`;
            if (seal !== undefined && !this.sent.has(key)) {
                this.sent.add(key);
                this.transmitReveal(game, seal);
            }
        }
    }

    private transmitReveal(game: BidPokerGame, seal: Readonly<Seal>): void {
        if (typeof seal.value === 'number') {
            this.room.transmitMessage(BPGameSessionType.REVEAL, { ...this.round(), session: game.session(), lot: game.lotIndex(), amount: seal.value, salt: seal.salt });
        } else {
            this.room.transmitMessage(BPGameSessionType.DISCARD, { ...this.round(), session: game.session(), cards: seal.value, salt: seal.salt });
        }
    }

    /** The local player commits to its part of the draw, then reveals it: its part kept in the tab */
    private async actOnDraw(draw: FairDraw, me: number): Promise<void> {
        const context: string = this._played().drawContext;
        const waiting: boolean = draw.waitingFor.includes(this.room.localPlayer.name);

        if (waiting && draw.phase === DrawPhase.COMMITTING && !this.sent.has(`draw:${ context }`)) {
            this.sent.add(`draw:${ context }`);
            // A page reloaded before its commitment came back commits to the same part again: the first one counts
            const part: string = this.partStore.get(context) ?? FairDraw.drawPart();
            this.partStore.save(context, part);
            this.room.transmitMessage(BPGameSessionType.DRAW, { ...this.round(), commitment: await FairDraw.commitment(context, me, part) });
        } else if (waiting && draw.phase === DrawPhase.REVEALING && !this.sent.has(`part:${ context }`)) {
            const part: string | undefined = this.partStore.get(context);
            if (part !== undefined) {
                this.sent.add(`part:${ context }`);
                this.room.transmitMessage(BPGameSessionType.DRAW, { ...this.round(), part });
            }
        }
    }
}
