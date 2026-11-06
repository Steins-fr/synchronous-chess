import { computed, Signal, signal } from '@angular/core';
import { Applied } from '@app/modules/commit-reveal/classes/applied';
import { DrawMessage } from '@app/modules/commit-reveal/classes/commit-reveal-messages';
import { CommitRevealSession } from '@app/modules/commit-reveal/classes/commit-reveal-session';
import { CommitmentPart, drawSalt, isCommitment } from '@app/modules/commit-reveal/classes/commitment';
import { PlayedCommitRevealGame } from '@app/modules/commit-reveal/classes/played-commit-reveal-game';
import { SeatedPlayer } from '@app/modules/game-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { BidPokerGame, BidPokerPhase, Lot } from '../rules/bid-poker-game';
import { BID_POKER_RULES, BidPokerRules } from '../rules/bid-poker-rules';
import { drawCatalogue } from '../rules/catalogue';
import {
    BID_POKER_TYPES, BidCommitMessage, BidDiscardMessage, BidPokerMessage, BidPokerPayloads, BidRevealMessage, BPGameSessionType,
} from './bid-poker-messages';

/** A game of the Bid Poker in the room: it has no setup */
export type PlayedBidGame = PlayedCommitRevealGame<BidPokerGame>;

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
export class BidPokerSession extends CommitRevealSession<
    typeof BID_POKER_TYPES, BidPokerPayloads, DrawMessage, BidPokerRules, BidPokerGame, null, PlayedBidGame, string, Seal
> {
    /** The local player plays the game in progress: leaving it asks to confirm */
    public readonly inMatch: Signal<boolean> = computed((): boolean => this.myIndex() !== null && this.started() && !this.over());

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

    /**
     * The bid of the local player on the lot auctioned, sealed until the bidding closes. Once closed, the game counts it
     * only when its commitment came first: sent as the time ran out, it is no bid
     */
    public readonly myBid: Signal<number | null> = computed((): number | null => {
        const game: BidPokerGame | null = this.game();
        const lot: Readonly<Lot> | null = game?.lot() ?? null;
        const me: number | null = this.myIndex();
        const counted: boolean = game?.phase() === BidPokerPhase.BIDDING || (me !== null && game?.committed().includes(me) === true);

        if (lot === null || !counted) {
            return null;
        }

        const seal: Readonly<Seal> | undefined = this._seals().get(`${ (game as BidPokerGame).session() }:${ lot.index }`);
        return typeof seal?.value === 'number' ? seal.value : null;
    });
    /** The discards of the local player in the change session, sealed until the discarding closes */
    public readonly myDiscards: Signal<ReadonlyArray<number> | null> = computed((): ReadonlyArray<number> | null => {
        const game: BidPokerGame | null = this.game();
        const seal: Readonly<Seal> | undefined = game === null ? undefined : this._seals().get(`${ game.session() }:${ ROUND_OF_DISCARDS }`);
        return Array.isArray(seal?.value) ? seal.value : null;
    });

    private readonly _catalogues = signal<number>(0);
    /** The catalogues drawn live, out of the history of the room: each one is heard */
    public readonly catalogues: Signal<number> = this._catalogues.asReadonly();

    public constructor(room: Room<BidPokerPayloads>, options: BidPokerSessionOptions = {}) {
        super(room, {
            rules: options.rules ?? BID_POKER_RULES,
            types: BID_POKER_TYPES,
            messages: Object.values(BPGameSessionType),
            sealKind: 'bids',
            played: (index: number, attempt: number): PlayedBidGame => new PlayedCommitRevealGame(index, attempt),
        });
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
        await this.sealValue(`${ game.session() }:${ game.lotIndex() }`, amount, game.lotIndex());
    }

    /** The local player discards cards, in its order, none to keep its cards: sealed until the discarding closes */
    public async discard(cards: ReadonlyArray<number>): Promise<void> {
        const game: BidPokerGame | null = this.game();
        if (game === null || !this.canDiscard()) {
            return;
        }
        await this.sealValue(`${ game.session() }:${ ROUND_OF_DISCARDS }`, cards, null);
    }

    protected override async apply(message: BidPokerMessage): Promise<void> {
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

    /** 4 players or more are seated */
    protected override enough(): boolean {
        return this.tableSeats.taken().length >= this.rules.minPlayers;
    }

    /** The Bid Poker has no setup: every start offers it */
    protected override setupOf(): null {
        return null;
    }

    protected override openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: null): void {
        this.played().open(seated, setup);
    }

    /** The game: its seed shuffles the deck and cuts it into the lots of the catalogue. A catalogue drawn live is heard */
    protected override async drawGame(seed: string, message: AppMessage<BPGameSessionType.DRAW, DrawMessage>): Promise<BidPokerGame> {
        const game: BidPokerGame = new BidPokerGame(this.rules, this.players().length, await drawCatalogue(seed, this.rules));
        if (!this.room.isHistory(message)) {
            this._catalogues.update((count: number) => count + 1);
        }
        return game;
    }

    /** The round of the values the phase reveals: the lot auctioned, or the discards of the session; none out of a reveal */
    protected override revealKey(game: BidPokerGame): string | null {
        switch (game.phase()) {
            case BidPokerPhase.REVEALING:
                return `${ game.session() }:${ game.lotIndex() }`;
            case BidPokerPhase.DISCLOSING:
                return `${ game.session() }:${ ROUND_OF_DISCARDS }`;
            default:
                return null;
        }
    }

    protected override transmitReveal(game: BidPokerGame, seal: Readonly<Seal>): void {
        if (typeof seal.value === 'number') {
            this.room.transmitMessage(BPGameSessionType.REVEAL, { ...this.round(), session: game.session(), lot: game.lotIndex(), amount: seal.value, salt: seal.salt });
        } else {
            this.room.transmitMessage(BPGameSessionType.DISCARD, { ...this.round(), session: game.session(), cards: seal.value, salt: seal.salt });
        }
    }

    /** The commitment to a value: the game, the player, the round and the value, with a salt */
    private preimage(round: string, value: number | ReadonlyArray<number>, salt: string, player: number): ReadonlyArray<CommitmentPart> {
        const kind: string = typeof value === 'number' ? 'bid' : ROUND_OF_DISCARDS;
        return [this.played().id(), kind, player, round, typeof value === 'number' ? value : JSON.stringify(value), salt];
    }

    /** Stores the value before committing to it: a reload reveals it */
    private async sealValue(round: string, value: number | ReadonlyArray<number>, lot: number | null): Promise<void> {
        // The round of the value, fixed before the hash: a timeout applied meanwhile moves to the next lot or session
        const sealed: Omit<BidCommitMessage, 'commitment'> = { ...this.round(), session: (this.game() as BidPokerGame).session(), lot };
        const salt: string = drawSalt();
        await this.seal(round, { round, value, salt }, this.preimage(round, value, salt, this.myIndex() as number),
            (commitment: string) => this.room.transmitMessage(BPGameSessionType.COMMIT, { ...sealed, commitment }));
    }

    /** A player commits to its bid or its discards: the first commitment counts */
    private onCommit(message: AppMessage<BPGameSessionType.COMMIT, BidCommitMessage>): void {
        const { session, lot, commitment } = message.payload;
        this.committed(this.applyCommit(message), `${ session }:${ lot ?? ROUND_OF_DISCARDS }`, message.from, commitment);
    }

    /**
     * Applies the commitment to the game, which ignores one of another lot, too late or a second one, and refuses a
     * malformed one or one of a seller on its own lot
     */
    private applyCommit(message: AppMessage<BPGameSessionType.COMMIT, BidCommitMessage>): Applied {
        const game: BidPokerGame | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { session, lot, commitment } = message.payload;

        if (game === null || player === null || !this.isRound(message.payload) || session !== game.session()) {
            return Applied.IGNORED;
        }
        if (!isCommitment(commitment)) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return Applied.ILLEGAL;
        }

        const discards: boolean = lot === null;
        if (!discards && lot !== game.lotIndex()) {
            return Applied.IGNORED;
        }
        const applied: Applied = discards ? game.commitDiscard(player) : game.commitBid(player);
        if (applied === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
        return applied;
    }

    /** A bidder reveals its bid: one not matching its commitment is reported, and counts as none */
    private async onReveal(message: AppMessage<BPGameSessionType.REVEAL, BidRevealMessage>): Promise<void> {
        const game: BidPokerGame | null = this.game();
        const player: number | null = this.indexOf(message.from);
        const { session, lot, amount, salt } = message.payload;

        if (game?.phase() !== BidPokerPhase.REVEALING || player === null || !this.isRound(message.payload) || session !== game.session()
            || lot !== game.lotIndex() || !game.awaited().includes(player)) {
            return;
        }

        const round: string = `${ session }:${ lot }`;
        if (!await this.opened(message, round, salt, (revealed: string) => this.preimage(round, typeof amount === 'number' ? amount : Number.NaN, revealed, player))) {
            return;
        }
        if (game.revealBid(player, amount) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }

    /** A player reveals its discards: ones not matching their commitment are reported, and count as none */
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
        if (!await this.opened(message, round, salt, (revealed: string) => this.preimage(round, discarded, revealed, player))) {
            return;
        }
        if (game.revealDiscard(player, discarded) === Applied.ILLEGAL) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
        }
    }
}
