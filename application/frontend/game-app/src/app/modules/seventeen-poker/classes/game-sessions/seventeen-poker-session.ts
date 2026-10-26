import { computed, Signal, signal, WritableSignal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { MentalDeck, DeckVerification } from '@app/modules/mental-poker/classes/mental-deck';
import { MentalDeckTable } from '@app/modules/mental-poker/classes/mental-deck-table';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { SraCipher } from '@app/modules/mental-poker/classes/sra-cipher';
import { mentalDeckBlockChains, MentalDeckPayloads } from '@app/modules/mental-poker/mental-deck-messages';
import { PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { SeatMessage, TableSeats, UnseatMessage } from '@app/modules/two-seat-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainRouting, mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Subscription } from 'rxjs';
import { BetAction } from '../rules/betting-round';
import { HAND_SIZE } from '../rules/hand-evaluator';
import { DRAW_PILE, HandPhase, MatchResult, PokerHand, PokerMatch, PokerMatchRules } from '../rules/poker-match';
import { otherSeat, PokerSeat, SeatPair, withSeat } from '../rules/poker-seat';
import { SEVENTEEN_DECK, seventeenCard } from '../rules/seventeen-deck';

export enum SPGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'SP_seat',
    /** The dealer of the next hand starts it, with a new deck */
    DEAL = 'SP_deal',
    /** An action of a player in a betting round */
    BET = 'SP_bet',
    /** The cards a player discards, to draw as many */
    EXCHANGE = 'SP_exchange',
    /** A player tells the time of the move of the other one, away, is over: the other one loses the match */
    TIMEOUT = 'SP_timeout',
    /** A player starts a new match, once the former one is over */
    REMATCH = 'SP_rematch',
    /** A player frees the seat of the other one, away while the seats are open */
    UNSEAT = 'SP_unseat',
}

export interface PokerDealMessage {
    /** The index of the hand started */
    hand: number;
}

export interface PokerBetMessage {
    hand: number;
    action: BetAction;
    /** The chips the player has put in the round after a bet or a raise */
    amount?: number;
}

export interface PokerExchangeMessage {
    hand: number;
    /** The positions in the deck of the cards discarded */
    positions: number[];
}

export interface PokerTimeoutMessage {
    hand: number;
    /** The move over: the actions played in the hand before it */
    move: number;
}

export interface PokerRematchMessage {
    /** The index of the new match in the room, from 0 */
    match: number;
}

export interface PokerGamePayloads {
    [SPGameSessionType.SEAT]: SeatMessage;
    [SPGameSessionType.DEAL]: PokerDealMessage;
    [SPGameSessionType.BET]: PokerBetMessage;
    [SPGameSessionType.EXCHANGE]: PokerExchangeMessage;
    [SPGameSessionType.TIMEOUT]: PokerTimeoutMessage;
    [SPGameSessionType.REMATCH]: PokerRematchMessage;
    [SPGameSessionType.UNSEAT]: UnseatMessage;
}

export type PokerPayloads = PokerGamePayloads & MentalDeckPayloads;

/** A match over, before the one in progress */
export interface PlayedMatch {
    readonly players: SeatPair<string | null>;
    /** None for a match stopped by a broken deck */
    readonly result: MatchResult | null;
    /** The player who lost the match on time */
    readonly forfeited: PokerSeat | null;
    /** The check of its decks, which may end once the next match started: a player away gives its keys once back */
    readonly verification: Signal<DeckVerification>;
}

/** A card of a player, at its position in the deck, null while the local participant does not read it */
export interface SeatCard {
    readonly position: number;
    readonly card: PlayingCard | null;
}

type PokerGameMessage = {
    [Type in keyof PokerGamePayloads]: AppMessage<Type, PokerGamePayloads[Type]>;
}[keyof PokerGamePayloads];

// The game and its decks share their chain: a deal is ordered with the keys it asks for
export const pokerBlockChains: BlockChainRouting<PokerPayloads> = mergeBlockChainRoutings<PokerGamePayloads, MentalDeckPayloads>({
    [SPGameSessionType.SEAT]: BlockChainName.POKER,
    [SPGameSessionType.DEAL]: BlockChainName.POKER,
    [SPGameSessionType.BET]: BlockChainName.POKER,
    [SPGameSessionType.EXCHANGE]: BlockChainName.POKER,
    [SPGameSessionType.TIMEOUT]: BlockChainName.POKER,
    [SPGameSessionType.REMATCH]: BlockChainName.POKER,
    [SPGameSessionType.UNSEAT]: BlockChainName.POKER,
}, mentalDeckBlockChains(BlockChainName.POKER));

export interface PokerSessionOptions {
    /** The cipher of the decks: the one of the app by default */
    readonly cipher?: SraCipher;
    /** The rules of the match: the ones of the manga by default */
    readonly rules?: PokerMatchRules;
}

/** The messages of a match in progress, which a broken deck stops */
const MATCH_MOVES: ReadonlySet<SPGameSessionType> = new Set<SPGameSessionType>([
    SPGameSessionType.DEAL, SPGameSessionType.BET, SPGameSessionType.EXCHANGE, SPGameSessionType.TIMEOUT,
]);

/**
 * The Seventeen Poker in a room. The participants take the seats themselves, final from the first hand of a match until
 * it is over, and the players deal by turns. Then a player starts a new match, or leaves its seat.
 *
 * Every participant applies the messages of the game in the order of the chain, one after the other, awaiting the deck
 * of the hand: a hand deals its cards with a new mental deck, the betting opening once both hands are read, so the first
 * player reading its cards learns nothing before the other one. The showdown opens the hands of both players, a folded
 * hand stays hidden. Once the match is over, the players disclose the keys of every deck, and each participant checks
 * them all, out of the chain: the next match does not wait for it.
 *
 * The id of a deck holds the salt of each player, drawn when it took its seat, and the index of the match in the room: a
 * deck of a match in another room of the same name, whose secrets a page may still keep, never has the id of a deck of
 * this one, whatever the other player sends, nor does a deck of a former match of the room.
 */
export class SeventeenPokerSession {
    private readonly _match = signal<PokerMatch>(new PokerMatch(this.options.rules));
    /** The match in progress, else the latest */
    public readonly match: Signal<PokerMatch> = this._match.asReadonly();
    private readonly _pastMatches = signal<ReadonlyArray<Readonly<PlayedMatch>>>([]);
    /** The matches over before the one in progress, the first one first */
    public readonly pastMatches: Signal<ReadonlyArray<Readonly<PlayedMatch>>> = this._pastMatches.asReadonly();

    private readonly _sending = signal<boolean>(false);
    /** An action of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** The seats of the table, open before the first hand of a match, and once it is over */
    public readonly tableSeats = new TableSeats(this.room, {
        types: { seat: SPGameSessionType.SEAT, unseat: SPGameSessionType.UNSEAT },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The players of each seat */
    public readonly seats: Signal<SeatPair<string | null>> = this.tableSeats.seats;
    /** The players of the match, the ones of the seats until its first hand: the seats may change once it is over */
    public readonly players: Signal<SeatPair<string | null>> = computed((): SeatPair<string | null> => {
        // A hand of the match has its deck, shuffled by both players
        const [one, two] = this.match().hand() === null ? this.seats() : (this._deck() as MentalDeck).players;
        return [one, two];
    });
    /** The seats are open before the first hand of a match, and once it is over */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => this.match().hand() === null || this.over());
    /** The connected participants without a seat */
    public readonly spectatorNumber: Signal<number> = this.tableSeats.spectatorNumber;
    public readonly mySeat: Signal<PokerSeat | null> = this.tableSeats.mySeat;
    /** The players of both seats, the ones not connected: a hand is dealt to connected players only */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;

    private readonly _deck = signal<MentalDeck | null>(null);
    /** The deck of the hand in progress, else of the latest */
    public readonly deck: Signal<MentalDeck | null> = this._deck.asReadonly();
    private readonly _positions = signal<SeatPair<ReadonlyArray<number>>>([[], []]);
    /** The positions in the deck of the cards of each player */
    public readonly positions: Signal<SeatPair<ReadonlyArray<number>>> = this._positions.asReadonly();
    private readonly _dealing = signal<boolean>(false);
    /** Cards are being dealt: the game waits for every player to read them */
    public readonly dealing: Signal<boolean> = this._dealing.asReadonly();
    private readonly _broken = signal<boolean>(false);
    /** A deck was cheated: the match stops, without a result */
    public readonly broken: Signal<boolean> = this._broken.asReadonly();
    /** The match is over, or stopped by a broken deck: its players may play a new one */
    public readonly over: Signal<boolean> = computed((): boolean => this.match().result() !== null || this._broken());
    private readonly _historySteps = signal<number>(0);
    /**
     * The steps of the history of the room applied, which a page reloaded or a participant joining late catches up with:
     * the start and the end of each of its messages, a showdown moving the chips once the cards are opened
     */
    public readonly historySteps: Signal<number> = this._historySteps.asReadonly();
    /** The check of the decks of the match, a signal of its own: it may end once the next match started */
    private readonly _verification = signal<WritableSignal<DeckVerification>>(signal<DeckVerification>(DeckVerification.PENDING));
    /** The check of every deck of the match, once it is over */
    public readonly verification: Signal<DeckVerification> = computed((): DeckVerification => this._verification()());

    /** The cards of each player the local participant reads, by position: its own, and both hands once shown */
    public readonly cards: Signal<SeatPair<ReadonlyArray<Readonly<SeatCard>>>> = computed((): SeatPair<ReadonlyArray<Readonly<SeatCard>>> => {
        const read: ReadonlyMap<number, number> = this._deck()?.cards() ?? new Map<number, number>();
        const ofSeat = (positions: ReadonlyArray<number>): SeatCard[] => positions.map((position: number): SeatCard => {
            const card: number | undefined = read.get(position);
            return { position, card: card === undefined ? null : seventeenCard(card) };
        });
        const [one, two] = this._positions();
        return [ofSeat(one), ofSeat(two)];
    });

    /** The cards left in the deck, the whole deck until it is ready to deal */
    public readonly deckCount: Signal<number> = computed((): number => this._deck()?.phase() === DeckPhase.READY ? this.match().drawPile() : SEVENTEEN_DECK.length);

    /** Whether the hand in progress waits for the local player to act */
    public readonly myTurn: Signal<boolean> = computed((): boolean => {
        const hand: PokerHand | null = this.match().hand();
        const seat: PokerSeat | null = this.mySeat();

        if (hand === null || seat === null || this._dealing() || this._broken() || this._sending()) {
            return false;
        }

        return hand.phase === HandPhase.EXCHANGE ? this.match().exchanging() === seat : hand.round.toAct === seat;
    });

    private readonly table: MentalDeckTable;
    /** The decks of the match */
    private decks: MentalDeck[] = [];
    private readonly subscription: Subscription;
    /** The messages of the game apply one after the other, each one awaiting the deck it acts on */
    private queue: Promise<void> = Promise.resolve();

    public constructor(private readonly room: Room<PokerPayloads>, private readonly options: PokerSessionOptions = {}) {
        // Before any message of a deck can come
        this.table = new MentalDeckTable(room);
        this.subscription = merge(
            room.messenger(SPGameSessionType.SEAT),
            room.messenger(SPGameSessionType.DEAL),
            room.messenger(SPGameSessionType.BET),
            room.messenger(SPGameSessionType.EXCHANGE),
            room.messenger(SPGameSessionType.TIMEOUT),
            room.messenger(SPGameSessionType.REMATCH),
            room.messenger(SPGameSessionType.UNSEAT),
        ).subscribe((message: PokerGameMessage) => {
            this.queue = this.queue.then(() => logHandlingFailure(message, this.handle(message)));
        });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
        this.table.destroy();
    }

    public takeSeat(seat: PokerSeat): void {
        this.tableSeats.takeSeat(seat);
    }

    public leaveSeat(): void {
        this.tableSeats.leaveSeat();
    }

    /** The dealer starts the next hand */
    public deal(): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.DEAL, { hand: this.match().nextHand() });
    }

    public bet(action: BetAction, amount?: number): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.BET, { hand: this.match().hand()?.index ?? 0, action, ...amount === undefined ? {} : { amount } });
    }

    /** Discards the cards of these positions, none to keep the hand */
    public exchange(positions: ReadonlyArray<number>): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.EXCHANGE, { hand: this.match().hand()?.index ?? 0, positions: [...positions] });
    }

    /** The time of the move of the other player is over, while it is away: it loses the match */
    public claimTimeout(): void {
        const hand: PokerHand | null = this.match().hand();
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.TIMEOUT, { hand: hand?.index ?? 0, move: hand?.moves ?? 0 });
    }

    /** A seated player starts a new match, once the former one is over */
    public rematch(): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.REMATCH, { match: this._pastMatches().length + 1 });
    }

    /** A seated player frees the seat of the other one, away */
    public unseat(seat: PokerSeat): void {
        this._sending.set(true);
        this.tableSeats.unseat(seat);
    }

    private seatOf(name: string): PokerSeat | null {
        return this.tableSeats.seatOf(name);
    }

    private async handle(message: PokerGameMessage): Promise<void> {
        const history: boolean = this.room.isHistory(message);
        const step = (): void => this._historySteps.update((steps: number) => steps + 1);

        if (history) {
            step();
        }

        try {
            await this.apply(message);
        } finally {
            if (history) {
                step();
            }
        }
    }

    private async apply(message: PokerGameMessage): Promise<void> {
        // The action of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== SPGameSessionType.SEAT) {
            this._sending.set(false);
        }

        // A broken deck stops the moves of the match: its seats open, a new match may start
        if (this._broken() && MATCH_MOVES.has(message.type)) {
            return;
        }

        switch (message.type) {
            case SPGameSessionType.SEAT:
                this.tableSeats.onSeat(message);
                break;
            case SPGameSessionType.DEAL:
                await this.onDeal(message);
                break;
            case SPGameSessionType.BET:
                await this.onBet(message);
                break;
            case SPGameSessionType.EXCHANGE:
                await this.onExchange(message);
                break;
            case SPGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case SPGameSessionType.REMATCH:
                this.onRematch(message);
                break;
            case SPGameSessionType.UNSEAT:
                this.tableSeats.onUnseat(message);
                break;
        }
    }

    private async onDeal(message: AppMessage<SPGameSessionType.DEAL, PokerDealMessage>): Promise<void> {
        const [one, two] = this.tableSeats.seated();
        const { hand } = message.payload;

        if (one === null || two === null || this.seatOf(message.from) !== this.match().dealer() || hand !== this.match().nextHand() || !this.match().startHand()) {
            return;
        }

        const deck: MentalDeck = this.table.deck({
            id: `${ one.salt }:${ two.salt }:${ this._pastMatches().length }:${ hand }`, size: SEVENTEEN_DECK.length, players: [one.name, two.name], cipher: this.options.cipher,
        });
        const positions: SeatPair<ReadonlyArray<number>> = [
            Array.from({ length: HAND_SIZE }, (_: unknown, index: number) => index),
            Array.from({ length: HAND_SIZE }, (_: unknown, index: number) => HAND_SIZE + index),
        ];
        this.decks.push(deck);
        this._deck.set(deck);
        this._positions.set(positions);
        await this.dealt(Promise.all([deck.deal(positions[PokerSeat.ONE], one.name), deck.deal(positions[PokerSeat.TWO], two.name)]));
    }

    private async onBet(message: AppMessage<SPGameSessionType.BET, PokerBetMessage>): Promise<void> {
        const seat: PokerSeat | null = this.seatOf(message.from);
        const { hand, action, amount } = message.payload;

        if (seat === null) {
            return;
        }

        if (hand !== this.match().hand()?.index || !this.match().bet(seat, action, amount)) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
            return;
        }

        if (this.match().hand()?.phase === HandPhase.SHOWDOWN) {
            await this.showdown();
        }

        this.verifyOnceOver();
    }

    private async onExchange(message: AppMessage<SPGameSessionType.EXCHANGE, PokerExchangeMessage>): Promise<void> {
        const seat: PokerSeat | null = this.seatOf(message.from);
        const { hand, positions: discarded } = message.payload;

        if (seat === null) {
            return;
        }

        const held: ReadonlyArray<number> = this._positions()[seat];
        const drawn: number = DRAW_PILE - this.match().drawPile();
        const valid: boolean = hand === this.match().hand()?.index && Array.isArray(discarded) && new Set(discarded).size === discarded.length
            && discarded.every((position: unknown) => held.includes(position as number));

        if (!valid || !this.match().exchange(seat, discarded.length)) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
            return;
        }

        // The cards drawn take the places of the cards discarded, in the order of the draw pile
        const draws: number[] = discarded.map((_: number, index: number) => 2 * HAND_SIZE + drawn + index);
        const deck: MentalDeck = this._deck() as MentalDeck;
        this._positions.update((positions: SeatPair<ReadonlyArray<number>>) => withSeat(positions, seat, held.map((position: number) => {
            const index: number = discarded.indexOf(position);
            return index === -1 ? position : draws[index];
        })));

        if (draws.length > 0) {
            await this.dealt(deck.deal(draws, this.seats()[seat] as string));
        }
    }

    /**
     * A player ends the move of the other one, away once its time was over, unless the move was played before: the
     * chain orders the move and the timeout, the first one counts. No page can tell when the other one was away
     */
    private onTimeout(message: AppMessage<SPGameSessionType.TIMEOUT, PokerTimeoutMessage>): void {
        const seat: PokerSeat | null = this.seatOf(message.from);
        const { hand, move } = message.payload;
        const current: PokerHand | null = this.match().hand();

        if (seat === null || hand !== current?.index || move !== current.moves || !this.match().forfeit(otherSeat(seat))) {
            return;
        }

        // The player away loses its seat too: it may not come back, and a spectator may take it for the next match
        this.tableSeats.free(otherSeat(seat));
        this.verifyOnceOver();
    }

    /**
     * A player starts a new match once the former one is over, or stopped by a broken deck, both seats taken: the first
     * request starts it, the others name a match started already. The second seat deals its first hand, as in the first
     * match
     */
    private onRematch(message: AppMessage<SPGameSessionType.REMATCH, PokerRematchMessage>): void {
        if (this.seatOf(message.from) === null || this.seats().includes(null) || !this.over() || message.payload.match !== this._pastMatches().length + 1) {
            return;
        }

        const played: PlayedMatch = { players: this.players(), result: this.match().result(), forfeited: this.match().forfeited(), verification: this._verification().asReadonly() };
        this._pastMatches.update((matches: ReadonlyArray<Readonly<PlayedMatch>>) => [...matches, played]);
        this._broken.set(false);
        this._match.set(new PokerMatch(this.options.rules));
        this.decks = [];
        this._deck.set(null);
        this._positions.set([[], []]);
        this._verification.set(signal<DeckVerification>(DeckVerification.PENDING));
    }

    /**
     * A broken deck stops the match. Its decks are disclosed, for the players to drop their secrets and the participants
     * to report the cheats: a key not giving any card at the showdown tells who gave it
     */
    private stop(): void {
        this._broken.set(true);
        this.decks.forEach((deck: MentalDeck) => void deck.disclose());
    }

    /** Waits for the cards dealt: a broken deck stops the match */
    private async dealt(dealing: Promise<unknown>): Promise<void> {
        this._dealing.set(true);

        try {
            await dealing;
        } catch {
            this.stop();
        } finally {
            this._dealing.set(false);
        }
    }

    /** Both players show their hands, opened for everyone */
    private async showdown(): Promise<void> {
        const deck: MentalDeck = this._deck() as MentalDeck;
        const positions: SeatPair<ReadonlyArray<number>> = this._positions();
        let opened: ReadonlyMap<number, number | undefined>;

        try {
            opened = await deck.open([...positions[PokerSeat.ONE], ...positions[PokerSeat.TWO]]);
        } catch {
            this.stop();
            return;
        }

        const hands: Array<Array<number | undefined>> = positions.map((held: ReadonlyArray<number>) => held.map((position: number) => opened.get(position)));

        // A key not giving any card: the disclosure tells who gave it
        if (hands.some((cards: Array<number | undefined>) => cards.includes(undefined))) {
            this.stop();
            return;
        }

        this.match().showdown([hands[0].map((card: number | undefined) => seventeenCard(card as number)), hands[1].map((card: number | undefined) => seventeenCard(card as number))]);
    }

    /** Once the match is over, every deck is disclosed and checked */
    private verifyOnceOver(): void {
        // The check of this match, whatever the match once it ends
        const check: WritableSignal<DeckVerification> = this._verification();

        if (this.match().result() === null || check() !== DeckVerification.PENDING) {
            return;
        }

        check.set(DeckVerification.CHECKING);
        void Promise.all(this.decks.map((deck: MentalDeck) => deck.disclose())).then((verifications: DeckVerification[]) => {
            check.set(verifications.every((verification: DeckVerification) => verification === DeckVerification.FAIR) ? DeckVerification.FAIR : DeckVerification.CHEATED);
        });
    }
}
