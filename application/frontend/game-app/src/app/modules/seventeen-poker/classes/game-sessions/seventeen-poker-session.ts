import { computed, Signal, signal } from '@angular/core';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { MentalDeck, DeckVerification } from '@app/modules/mental-poker/classes/mental-deck';
import { MentalDeckTable } from '@app/modules/mental-poker/classes/mental-deck-table';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { SraCipher } from '@app/modules/mental-poker/classes/sra-cipher';
import { mentalDeckBlockChains, MentalDeckPayloads } from '@app/modules/mental-poker/mental-deck-messages';
import { PlayingCard } from '@app/modules/playing-cards/types/playing-card';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainRouting, mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Subscription } from 'rxjs';
import { BetAction } from '../rules/betting-round';
import { HAND_SIZE } from '../rules/hand-evaluator';
import { DRAW_PILE, HandPhase, PokerHand, PokerMatch, PokerMatchRules } from '../rules/poker-match';
import { PokerSeat, SeatPair, withSeat } from '../rules/poker-seat';
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
}

export interface PokerSeatMessage {
    /** The seat taken, null to leave the seat */
    seat: PokerSeat | null;
    /** The part of the player in the ids of the decks of the match, drawn for each seat taken */
    salt?: string;
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

export interface PokerGamePayloads {
    [SPGameSessionType.SEAT]: PokerSeatMessage;
    [SPGameSessionType.DEAL]: PokerDealMessage;
    [SPGameSessionType.BET]: PokerBetMessage;
    [SPGameSessionType.EXCHANGE]: PokerExchangeMessage;
}

export type PokerPayloads = PokerGamePayloads & MentalDeckPayloads;

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
}, mentalDeckBlockChains(BlockChainName.POKER));

export interface PokerSessionOptions {
    /** The cipher of the decks: the one of the app by default */
    readonly cipher?: SraCipher;
    /** The rules of the match: the ones of the manga by default */
    readonly rules?: PokerMatchRules;
}

/** A player on its seat, with its part in the ids of the decks of the match */
interface SeatedPlayer {
    readonly name: string;
    readonly salt: string;
}

/** The bytes of the salt of a player */
const SALT_LENGTH: number = 16;
const SALT_PATTERN: RegExp = new RegExp(`^[0-9a-f]{${ 2 * SALT_LENGTH }}$`);

/**
 * The Seventeen Poker in a room. The participants take the seats themselves, final once the first hand is dealt, and the
 * players deal by turns.
 *
 * Every participant applies the messages of the game in the order of the chain, one after the other, awaiting the deck
 * of the hand: a hand deals its cards with a new mental deck, the betting opening once both hands are read, so the first
 * player reading its cards learns nothing before the other one. The showdown opens the hands of both players, a folded
 * hand stays hidden. Once the match is over, the players disclose the keys of every deck, and each participant checks
 * them all.
 *
 * The id of a deck holds the salt of each player, drawn when it took its seat: a deck of a former match, whose secrets a
 * page may still keep, never has the id of a deck of this one, whatever the other player sends.
 */
export class SeventeenPokerSession {
    public readonly match: PokerMatch = new PokerMatch(this.options.rules);

    private readonly seated = signal<SeatPair<Readonly<SeatedPlayer> | null>>([null, null]);
    /** The players of each seat */
    public readonly seats: Signal<SeatPair<string | null>> = computed((): SeatPair<string | null> => {
        const [one, two] = this.seated();
        return [one?.name ?? null, two?.name ?? null];
    });
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => this.match.hand() === null);
    /** The connected participants without a seat */
    public readonly spectatorNumber: Signal<number> = computed((): number => {
        const seats: SeatPair<string | null> = this.seats();
        return this.room.players().filter(({ name }) => !seats.includes(name)).length;
    });
    public readonly mySeat: Signal<PokerSeat | null> = computed((): PokerSeat | null => this.seatOf(this.room.localPlayer.name));
    /** The players of both seats, the ones not connected: a hand is dealt to connected players only */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const connected: ReadonlySet<string> = new Set<string>(this.room.players().map(({ name }) => name));
        return this.seats().filter((name: string | null): name is string => name !== null && !connected.has(name));
    });

    private readonly _deck = signal<MentalDeck | null>(null);
    /** The deck of the hand in progress, else of the latest */
    public readonly deck: Signal<MentalDeck | null> = this._deck.asReadonly();
    private readonly _positions = signal<SeatPair<ReadonlyArray<number>>>([[], []]);
    /** The positions in the deck of the cards of each player */
    public readonly positions: Signal<SeatPair<ReadonlyArray<number>>> = this._positions.asReadonly();
    private readonly _sending = signal<boolean>(false);
    /** An action of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();
    private readonly _dealing = signal<boolean>(false);
    /** Cards are being dealt: the game waits for every player to read them */
    public readonly dealing: Signal<boolean> = this._dealing.asReadonly();
    private readonly _broken = signal<boolean>(false);
    /** A deck was cheated: the match stops */
    public readonly broken: Signal<boolean> = this._broken.asReadonly();
    private readonly _verification = signal<DeckVerification>(DeckVerification.PENDING);
    /** The check of every deck of the match, once it is over */
    public readonly verification: Signal<DeckVerification> = this._verification.asReadonly();

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
    public readonly deckCount: Signal<number> = computed((): number => this._deck()?.phase() === DeckPhase.READY ? this.match.drawPile() : SEVENTEEN_DECK.length);

    /** Whether the hand in progress waits for the local player to act */
    public readonly myTurn: Signal<boolean> = computed((): boolean => {
        const hand: PokerHand | null = this.match.hand();
        const seat: PokerSeat | null = this.mySeat();

        if (hand === null || seat === null || this._dealing() || this._broken() || this._sending()) {
            return false;
        }

        return hand.phase === HandPhase.EXCHANGE ? this.match.exchanging() === seat : hand.round.toAct === seat;
    });

    private readonly table: MentalDeckTable;
    private readonly decks: MentalDeck[] = [];
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
        ).subscribe((message: PokerGameMessage) => {
            this.queue = this.queue.then(() => logHandlingFailure(message, this.handle(message)));
        });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
        this.table.destroy();
    }

    public takeSeat(seat: PokerSeat): void {
        this.room.transmitMessage(SPGameSessionType.SEAT, { seat, salt: CryptoHelper.randomHex(SALT_LENGTH) });
    }

    public leaveSeat(): void {
        this.room.transmitMessage(SPGameSessionType.SEAT, { seat: null });
    }

    /** The dealer starts the next hand */
    public deal(): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.DEAL, { hand: this.match.nextHand() });
    }

    public bet(action: BetAction, amount?: number): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.BET, { hand: this.match.hand()?.index ?? 0, action, ...amount === undefined ? {} : { amount } });
    }

    /** Discards the cards of these positions, none to keep the hand */
    public exchange(positions: ReadonlyArray<number>): void {
        this._sending.set(true);
        this.room.transmitMessage(SPGameSessionType.EXCHANGE, { hand: this.match.hand()?.index ?? 0, positions: [...positions] });
    }

    private seatOf(name: string): PokerSeat | null {
        const index: number = this.seats().indexOf(name);
        return index === -1 ? null : index;
    }

    private async handle(message: PokerGameMessage): Promise<void> {
        // The action of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== SPGameSessionType.SEAT) {
            this._sending.set(false);
        }

        if (this._broken()) {
            return;
        }

        switch (message.type) {
            case SPGameSessionType.SEAT:
                this.onSeat(message);
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
        }
    }

    /**
     * A participant has a single seat: taking a seat leaves the other one. The first request for a free seat gets it,
     * with the salt of its player
     */
    private onSeat(message: AppMessage<SPGameSessionType.SEAT, PokerSeatMessage>): void {
        const { seat, salt } = message.payload;

        if (!this.seatsOpen() || (seat !== null && seat !== PokerSeat.ONE && seat !== PokerSeat.TWO)) {
            return;
        }

        const [one, two] = this.seated();
        const left: SeatPair<Readonly<SeatedPlayer> | null> = [one?.name === message.from ? null : one, two?.name === message.from ? null : two];

        if (seat === null) {
            this.seated.set(left);
        } else if (left[seat] === null && typeof salt === 'string' && SALT_PATTERN.test(salt)) {
            this.seated.set(withSeat(left, seat, { name: message.from, salt }));
        }
    }

    private async onDeal(message: AppMessage<SPGameSessionType.DEAL, PokerDealMessage>): Promise<void> {
        const [one, two] = this.seated();
        const { hand } = message.payload;

        if (one === null || two === null || this.seatOf(message.from) !== this.match.dealer() || hand !== this.match.nextHand() || !this.match.startHand()) {
            return;
        }

        const deck: MentalDeck = this.table.deck({
            id: `${ one.salt }:${ two.salt }:${ hand }`, size: SEVENTEEN_DECK.length, players: [one.name, two.name], cipher: this.options.cipher,
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

        if (hand !== this.match.hand()?.index || !this.match.bet(seat, action, amount)) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
            return;
        }

        if (this.match.hand()?.phase === HandPhase.SHOWDOWN) {
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
        const drawn: number = DRAW_PILE - this.match.drawPile();
        const valid: boolean = hand === this.match.hand()?.index && Array.isArray(discarded) && new Set(discarded).size === discarded.length
            && discarded.every((position: unknown) => held.includes(position as number));

        if (!valid || !this.match.exchange(seat, discarded.length)) {
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

    /** Waits for the cards dealt: a broken deck stops the match */
    private async dealt(dealing: Promise<unknown>): Promise<void> {
        this._dealing.set(true);

        try {
            await dealing;
        } catch {
            this._broken.set(true);
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
            this._broken.set(true);
            return;
        }

        const hands: Array<Array<number | undefined>> = positions.map((held: ReadonlyArray<number>) => held.map((position: number) => opened.get(position)));

        // A key not giving any card: the disclosure tells who gave it
        if (hands.some((cards: Array<number | undefined>) => cards.includes(undefined))) {
            this._broken.set(true);
            return;
        }

        this.match.showdown([hands[0].map((card: number | undefined) => seventeenCard(card as number)), hands[1].map((card: number | undefined) => seventeenCard(card as number))]);
    }

    /** Once the match is over, every deck is disclosed and checked */
    private verifyOnceOver(): void {
        if (this.match.result() === null || this._verification() !== DeckVerification.PENDING) {
            return;
        }

        this._verification.set(DeckVerification.CHECKING);
        void Promise.all(this.decks.map((deck: MentalDeck) => deck.disclose())).then((verifications: DeckVerification[]) => {
            this._verification.set(verifications.every((verification: DeckVerification) => verification === DeckVerification.FAIR) ? DeckVerification.FAIR : DeckVerification.CHEATED);
        });
    }
}
