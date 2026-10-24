import {
    afterRenderEffect, Component, computed, effect, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, signal, untracked, viewChild,
    WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DeckVerification, MentalDeck } from '@app/modules/mental-poker/classes/mental-deck';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { CardDeckComponent } from '@app/modules/playing-cards/components/card-deck/card-deck.component';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { scopedKey } from '@app/services/language/scoped-key';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PlayedMatch, PokerPayloads, PokerSessionOptions, SeatCard, SeventeenPokerSession } from '../../classes/game-sessions/seventeen-poker-session';
import { handOutcomeText } from '../../helpers/hand-outcome-text.helper';
import { ChipPlace, ChipPlaceKind, chipTransfers, ChipTransfer, TableChips } from '../../helpers/chip-transfers.helper';
import { BetAction, BetLimits } from '../../classes/rules/betting-round';
import { HAND_SIZE, HandValue } from '../../classes/rules/hand-evaluator';
import { HandEnd, HandOutcome, HandPhase, MatchResult, PokerHand, PokerMatch } from '../../classes/rules/poker-match';
import { otherSeat, PokerSeat, SeatPair } from '../../classes/rules/poker-seat';
import { CLOCK_LOW, PokerSeatComponent } from '../poker-seat/poker-seat.component';

/** The options of the session of the table: the cipher and the rules of the app, lighter ones for the specs */
export const POKER_SESSION_OPTIONS = new InjectionToken<PokerSessionOptions>('POKER_SESSION_OPTIONS', { factory: (): PokerSessionOptions => ({}) });

/** The chips a click on more or less adds to the amount of a bet */
const BET_STEP: number = 5;

/** The clock of a move ticks every second */
const CLOCK_TICK: number = 1000;
const MS_PER_SECOND: number = 1000;
/** A tick may come a bit before the end of a move, which is over once less than half a tick is left */
const LAST_TICK: number = CLOCK_TICK / MS_PER_SECOND / 2;
/** The bank, off the table: the chips going to it fly to the right side of the cloth, this far inside it */
const BANK_INSET: number = 16;

/** A place of the table, from its top left corner */
interface TablePoint {
    readonly x: number;
    readonly y: number;
}

/** The result of a match over before the one in progress */
interface PastResult {
    /** Its number in the room, from 1 */
    readonly number: number;
    readonly text: TranslatableText;
    /** The check of its decks, which may end once the next match started */
    readonly verification: TranslatableText;
}

/** Chips flying from a place of the table to another one */
interface ChipFlight {
    readonly id: number;
    readonly amount: number;
    readonly from: TablePoint;
    readonly to: TablePoint;
}

/** The table of the Seventeen Poker: the seats, the hands, the deck and the pot, and the actions of the local player */
@Component({
    selector: 'app-poker-table',
    templateUrl: './poker-table.component.html',
    styleUrl: './poker-table.component.scss',
    imports: [CardDeckComponent, CardHandComponent, ChipStackComponent, MatButtonModule, PokerSeatComponent, TranslocoDirective, TranslocoPipe],
    host: { class: 'block max-w-[720px] mx-auto px-4' },
})
export class PokerTableComponent implements OnDestroy {
    public readonly room = input.required<Room<PokerPayloads>>();
    private readonly options: PokerSessionOptions = inject(POKER_SESSION_OPTIONS);

    protected readonly session: Signal<SeventeenPokerSession> = computed((): SeventeenPokerSession => {
        const room: Room<PokerPayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new SeventeenPokerSession(room, this.options));
    });

    protected readonly betAction: typeof BetAction = BetAction;
    protected readonly seatOne: PokerSeat = PokerSeat.ONE;
    protected readonly seatTwo: PokerSeat = PokerSeat.TWO;

    /** The seat at the bottom of the table: the one of the local player, the first one for a spectator */
    protected readonly bottomSeat: Signal<PokerSeat> = computed((): PokerSeat => this.session().mySeat() ?? PokerSeat.ONE);
    protected readonly topSeat: Signal<PokerSeat> = computed((): PokerSeat => otherSeat(this.bottomSeat()));

    /** Whether each seat holds the player of the match: once it is over, another participant may take it */
    private readonly matchSeats: Signal<SeatPair<boolean>> = computed((): SeatPair<boolean> => {
        const seats: SeatPair<string | null> = this.session().seats();
        const players: SeatPair<string | null> = this.session().players();
        return [seats[PokerSeat.ONE] === players[PokerSeat.ONE], seats[PokerSeat.TWO] === players[PokerSeat.TWO]];
    });

    /** The chips of each seat: a participant taking a seat once the match is over starts the next one with its stack */
    protected readonly chips: Signal<SeatPair<number>> = computed((): SeatPair<number> => {
        const match: PokerMatch = this.session().match();
        const of = (seat: PokerSeat): number => this.matchSeats()[seat] ? match.stacks()[seat] : match.rules.stack;
        return [of(PokerSeat.ONE), of(PokerSeat.TWO)];
    });

    /** The cards of each seat, as the hands show them, none for a seat its player of the match left */
    protected readonly hands: Signal<ReadonlyArray<ReadonlyArray<Readonly<HandCard>>>> = computed((): ReadonlyArray<ReadonlyArray<Readonly<HandCard>>> => {
        const deckId: string | undefined = this.session().deck()?.id;
        const matchSeats: SeatPair<boolean> = this.matchSeats();
        return this.session().cards().map((cards: ReadonlyArray<Readonly<SeatCard>>, seat: number) => {
            return matchSeats[seat] ? cards.map(({ position, card }) => ({ id: `${ deckId }:${ position }`, card })) : [];
        });
    });

    /** The ids of the cards of the local player selected to discard */
    protected readonly selected: WritableSignal<ReadonlyArray<string>> = signal<ReadonlyArray<string>>([]);

    protected readonly hand: Signal<PokerHand | null> = computed((): PokerHand | null => this.session().match().hand());
    protected readonly exchanging: Signal<boolean> = computed((): boolean => this.session().myTurn() && this.hand()?.phase === HandPhase.EXCHANGE);
    protected readonly betting: Signal<boolean> = computed((): boolean => this.session().myTurn() && this.hand()?.phase !== HandPhase.EXCHANGE);
    /** The most cards the local player discards: the cards left to draw */
    protected readonly maxExchange: Signal<number> = computed((): number => Math.min(HAND_SIZE, this.session().match().drawPile()));

    /** The bounds of a bet or a raise of the local player, null when it can not bet */
    protected readonly betRange: Signal<BetLimits | null> = computed((): BetLimits | null => this.betting() ? (this.hand() as PokerHand).round.betRange() : null);
    /** The amount of the bet the local player prepares, the least one at first */
    protected readonly amount: WritableSignal<number> = linkedSignal((): number => (this.betRange() as BetLimits).min);
    /** The chips the local player calls, while it bets */
    protected readonly toCall: Signal<number> = computed((): number => {
        const { round } = this.hand() as PokerHand;
        return round.highest - round.bets[this.session().mySeat() as PokerSeat];
    });
    protected readonly actions: Signal<ReadonlyArray<BetAction>> = computed((): ReadonlyArray<BetAction> => this.betting() ? (this.hand() as PokerHand).round.legalActions() : []);

    /** The dealer deals the next hand while the match goes on */
    protected readonly canDeal: Signal<boolean> = computed((): boolean => {
        const session: SeventeenPokerSession = this.session();
        const hand: PokerHand | null = this.hand();
        return session.mySeat() === session.match().dealer() && !session.seats().includes(null) && !this.waiting() && !session.sending()
            && !session.broken() && session.match().result() === null && (hand === null || hand.phase === HandPhase.OVER);
    });

    /** A seated player starts a new match once the former one is over, both seats taken */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: SeventeenPokerSession = this.session();
        return session.mySeat() !== null && !session.seats().includes(null) && session.match().result() !== null && !session.sending();
    });

    /** The seat whose player acts, which the table shows */
    protected readonly toAct: Signal<PokerSeat | null> = computed((): PokerSeat | null => {
        const hand: PokerHand | null = this.hand();

        if (hand === null || this.session().dealing() || this.session().broken()) {
            return null;
        }

        return this.session().match().toAct();
    });

    /** A seated player is away: the table waits for it, the clock of the move running */
    private readonly waiting: Signal<boolean> = computed((): boolean => this.session().awayPlayers().length > 0);
    private readonly _timeLeft = signal<number | null>(null);
    /** The seconds left to the player to act for its move */
    protected readonly timeLeft: Signal<number | null> = this._timeLeft.asReadonly();
    // Each move has its time, from when the page sees it, a new one at each action: once over, the page of its player
    // plays for it, or the page of the other player ends the match while it is away
    private readonly turnClock = effect((onCleanup: (cleanup: () => void) => void): void => {
        // Each action changes the hand: the clock starts again, for a seat acting twice in a row too
        if (this.hand() === null || this.toAct() === null) {
            this._timeLeft.set(null);
            return;
        }

        const { turnTime, awayTime } = this.session().match().rules;
        // The time of the page, which the clock of the system does not set back or forward
        let deadline: number = performance.now() + turnTime * MS_PER_SECOND;
        let extended: boolean = false;
        this._timeLeft.set(turnTime);
        const clock: ReturnType<typeof setInterval> = setInterval(() => {
            // A seated player away gives the move more time, once: a player leaving and coming back gets no more
            if (!extended && this.waiting()) {
                extended = true;
                deadline += awayTime * MS_PER_SECOND;
            }

            const left: number = (deadline - performance.now()) / MS_PER_SECOND;

            if (left < LAST_TICK) {
                this._timeLeft.set(0);
                clearInterval(clock);
                this.timeOut();
            } else {
                this._timeLeft.set(Math.ceil(left));
            }
        }, CLOCK_TICK);
        onCleanup(() => clearInterval(clock));
    });
    /** The time of the move runs out: the status of the local player tells it, once, for a screen reader too */
    private readonly hurry: Signal<boolean> = computed((): boolean => {
        const left: number | null = this.timeLeft();
        return left !== null && left <= CLOCK_LOW;
    });
    /** The chips of the hand in progress, none once shared out */
    protected readonly pot: Signal<number> = computed((): number => {
        const hand: PokerHand | null = this.hand();
        return hand === null || hand.phase === HandPhase.OVER ? 0 : hand.pot;
    });

    /** The chips of each seat in the betting round in progress, on the cloth in front of it */
    protected readonly bets: Signal<SeatPair<number>> = computed((): SeatPair<number> => {
        const hand: PokerHand | null = this.hand();
        const betting: boolean = hand?.phase === HandPhase.FIRST_ROUND || hand?.phase === HandPhase.SECOND_ROUND;
        return betting ? (hand as PokerHand).round.bets : [0, 0];
    });

    /** The chips in the middle of the cloth: the pot, but the bets of the round in progress */
    protected readonly potChips: Signal<number> = computed((): number => this.pot() - this.bets()[PokerSeat.ONE] - this.bets()[PokerSeat.TWO]);

    /** The outcome of the hand over, until the next one is dealt */
    protected readonly outcome: Signal<Readonly<HandOutcome> | null> = computed((): Readonly<HandOutcome> | null => {
        const hand: PokerHand | null = this.hand();
        return hand?.phase === HandPhase.OVER ? hand.outcome : null;
    });

    /** The kind of hand of each seat, once shown */
    protected readonly categories: Signal<SeatPair<TranslatableText | null>> = computed((): SeatPair<TranslatableText | null> => {
        const hands: SeatPair<HandValue> | null | undefined = this.outcome()?.hands;
        const of = (seat: PokerSeat): TranslatableText | null => hands && this.matchSeats()[seat] ? { key: this.key(marker('table.category', undefined, 'poker')), params: { category: hands[seat].category } } : null;
        return [of(PokerSeat.ONE), of(PokerSeat.TWO)];
    });

    private readonly _flights = signal<ReadonlyArray<Readonly<ChipFlight>>>([]);
    /** The chips moved by the latest change of the table, flying over it */
    protected readonly flights: Signal<ReadonlyArray<Readonly<ChipFlight>>> = this._flights.asReadonly();
    private nextFlight: number = 0;

    /** The deck is being shuffled and locked */
    protected readonly shuffling: Signal<boolean> = computed((): boolean => {
        const phase: DeckPhase | undefined = this.session().deck()?.phase();
        return phase === DeckPhase.SHUFFLING || phase === DeckPhase.LOCKING;
    });

    /** The seat of the hand winning the pot at the showdown, while it shows */
    private readonly winner: Signal<PokerSeat | null> = computed((): PokerSeat | null => {
        const outcome: Readonly<HandOutcome> | null = this.outcome();
        return outcome?.end === HandEnd.SHOWDOWN ? outcome.winner : null;
    });

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const session: SeventeenPokerSession = this.session();
        const hand: PokerHand | null = this.hand();

        if (session.broken()) {
            return { key: this.key(marker('table.status.broken', undefined, 'poker')) };
        }

        if (session.seats().includes(null)) {
            return { key: this.key(marker('table.status.seats', undefined, 'poker')) };
        }

        // The local player to act plays while the other one is away
        if (this.waiting() && session.match().result() === null && !session.myTurn()) {
            return { key: this.key(marker('table.status.away', undefined, 'poker')), params: { name: session.awayPlayers().join(', ') } };
        }

        if (hand === null || hand.phase === HandPhase.OVER) {
            return session.match().result() === null ? this.dealStatus() : null;
        }

        // A hand in progress has its deck
        const deck: MentalDeck = session.deck() as MentalDeck;
        return deck.phase() !== DeckPhase.READY || session.dealing() ? this.deckStatus(deck) : this.turnStatus(hand);
    });

    /** The outcome of each hand played in the match, the latest first */
    protected readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const players: SeatPair<string | null> = this.session().players();
        return this.session().match().outcomes().map((outcome: Readonly<HandOutcome>, index: number) => handOutcomeText(outcome, index, players)).reverse();
    });

    /** The result of each match over before the one in progress, by its number in the room, then the check of its decks, the latest first */
    protected readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> => {
        return this.session().pastMatches().map((played: Readonly<PlayedMatch>, index: number): PastResult => ({
            number: index + 1,
            text: this.resultText(played),
            // A match over started the check of its decks
            verification: this.verificationText(played.verification()) as TranslatableText,
        })).reverse();
    });

    /** The outcome of the hand over, on the cloth */
    protected readonly outcomeText: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const outcome: Readonly<HandOutcome> | null = this.outcome();
        return outcome === null ? null : handOutcomeText(outcome, (this.hand() as PokerHand).index, this.session().players());
    });

    protected readonly result: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const session: SeventeenPokerSession = this.session();
        const result: MatchResult | null = session.match().result();
        return result === null ? null : this.resultText({ players: session.players(), result, forfeited: session.match().forfeited() });
    });

    protected readonly verification: Signal<TranslatableText | null> = computed((): TranslatableText | null => this.verificationText(this.session().verification()));

    // The places of the chips on the table
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly clothView: Signal<ElementRef<HTMLElement>> = viewChild.required('cloth');
    private readonly potView: Signal<ChipStackComponent> = viewChild.required('potStack');
    private readonly topBetView: Signal<ChipStackComponent> = viewChild.required('topBet');
    private readonly bottomBetView: Signal<ChipStackComponent> = viewChild.required('bottomBet');
    private readonly topSeatView: Signal<PokerSeatComponent> = viewChild.required('topSeatView');
    private readonly bottomSeatView: Signal<PokerSeatComponent> = viewChild.required('bottomSeatView');

    private readonly pageVisibility: PageVisibilityService = inject(PageVisibilityService);

    /** The chips on the table last shown, with their session, its match and the steps of its history applied then */
    private shown: { readonly session: SeventeenPokerSession; readonly match: PokerMatch; readonly chips: Readonly<TableChips>; readonly historySteps: number } | null = null;

    // Once the table shows a change, the chips it moved fly from where they were to where they are
    private readonly chipMoves = afterRenderEffect({
        earlyRead: (): ReadonlyArray<Readonly<ChipFlight>> => {
            const session: SeventeenPokerSession = this.session();
            const match: PokerMatch = session.match();
            const chips: Readonly<TableChips> = { stacks: match.stacks(), bets: this.bets(), pot: this.potChips() };
            const historySteps: number = session.historySteps();
            // A new session or a new match starts from its own chips, and the history of the room it catches up with moves none
            const previous: Readonly<TableChips> | null = this.shown?.session === session && this.shown.match === match && this.shown.historySteps === historySteps
                ? this.shown.chips
                : null;
            const transfers: ReadonlyArray<Readonly<ChipTransfer>> = previous === null ? [] : chipTransfers(previous, chips);
            this.shown = { session, match, chips, historySteps };
            return this.flightsOf(transfers);
        },
        write: (flights: Signal<ReadonlyArray<Readonly<ChipFlight>>>): void => {
            const flying: ReadonlyArray<Readonly<ChipFlight>> = flights();

            // The chips still flying land, the new ones take off
            if (flying.length > 0) {
                this._flights.update((flown: ReadonlyArray<Readonly<ChipFlight>>) => [...flown, ...flying]);
            }
        },
    });

    public ngOnDestroy(): void {
        this.session().destroy();
    }

    /** A participant without a seat takes a free one while the seats are open */
    protected canTake(seat: PokerSeat): boolean {
        const session: SeventeenPokerSession = this.session();
        return session.seatsOpen() && session.seats()[seat] === null && session.mySeat() === null;
    }

    /** The local player leaves its seat, at the bottom of the table, while the seats are open */
    protected canLeave(): boolean {
        return this.session().seatsOpen() && this.session().mySeat() !== null;
    }

    /** The local player frees the seat of the other player, away, while the seats are open */
    protected canRelease(seat: PokerSeat): boolean {
        const session: SeventeenPokerSession = this.session();
        const name: string | null = session.seats()[seat];
        return session.seatsOpen() && session.mySeat() === otherSeat(seat) && name !== null && session.awayPlayers().includes(name);
    }

    /** The chips the player of a seat won in the hand over, while it keeps the seat */
    protected gain(seat: PokerSeat): number {
        return this.matchSeats()[seat] ? this.outcome()?.gains[seat] ?? 0 : 0;
    }

    /** Whether the hand of a seat lost at the showdown */
    protected losing(seat: PokerSeat): boolean {
        return this.winner() === otherSeat(seat);
    }

    /** Chips flown to their place, or whose flight was cancelled: the animation of a chip inside them ends earlier */
    protected land(id: number, event: Event): void {
        if (event.target === event.currentTarget) {
            this._flights.update((flights: ReadonlyArray<Readonly<ChipFlight>>) => flights.filter((flight: Readonly<ChipFlight>) => flight.id !== id));
        }
    }

    /** The cards of the seat winning the pot */
    protected winning(seat: PokerSeat): ReadonlyArray<string> {
        return this.winner() === seat ? this.hands()[seat].map((card: HandCard) => card.id) : [];
    }

    protected takeSeat(seat: PokerSeat): void {
        this.session().takeSeat(seat);
    }

    protected leaveSeat(): void {
        this.session().leaveSeat();
    }

    protected release(seat: PokerSeat): void {
        this.session().unseat(seat);
    }

    /** A click on a button the page did not hide yet (a second click, the turn over meanwhile) does nothing */
    protected deal(): void {
        if (this.canDeal()) {
            this.session().deal();
        }
    }

    protected rematch(): void {
        if (this.canRematch()) {
            this.session().rematch();
        }
    }

    protected act(action: BetAction): void {
        if (!this.actions().includes(action)) {
            return;
        }

        const amount: boolean = action === BetAction.BET || action === BetAction.RAISE;
        this.session().bet(action, amount ? this.amount() : undefined);
    }

    /** Changes the amount of the bet, within its bounds */
    protected setAmount(amount: number): void {
        // The buttons changing the amount show with the bounds only
        const range: BetLimits = this.betRange() as BetLimits;
        this.amount.set(Math.min(range.max, Math.max(range.min, amount)));
    }

    protected step(direction: number): void {
        this.setAmount(this.amount() + direction * BET_STEP);
    }

    /** Discards the cards selected, none to keep the hand */
    protected exchange(): void {
        if (!this.exchanging()) {
            return;
        }

        const seat: PokerSeat = this.session().mySeat() as PokerSeat;
        const deckId: string = (this.session().deck() as MentalDeck).id;
        const selected: ReadonlyArray<string> = this.selected();
        const positions: ReadonlyArray<number> = this.session().cards()[seat]
            .filter(({ position }) => selected.includes(`${ deckId }:${ position }`))
            .map(({ position }) => position);
        this.selected.set([]);
        this.session().exchange(positions);
    }

    /**
     * The time of the move is over. The local player checks, or folds against a bet, and keeps its hand in the exchange:
     * an action sent meanwhile is the move. The other player, away, loses the match; back, its page plays for it
     */
    private timeOut(): void {
        const session: SeventeenPokerSession = this.session();
        const toAct: PokerSeat = this.toAct() as PokerSeat;

        if (this.exchanging()) {
            this.selected.set([]);
            this.exchange();
        } else if (this.betting()) {
            this.act(this.actions().includes(BetAction.CHECK) ? BetAction.CHECK : BetAction.FOLD);
        } else if (session.mySeat() === otherSeat(toAct) && session.awayPlayers().includes(session.seats()[toAct] as string)) {
            session.claimTimeout();
        }
    }

    /** The result of a match, with the names of its players */
    private resultText({ players, result, forfeited }: Readonly<Omit<PlayedMatch, 'verification'>>): TranslatableText {
        if (forfeited !== null) {
            return { key: this.key(marker('table.result.forfeit', undefined, 'poker')), params: { loser: players[forfeited], winner: players[otherSeat(forfeited)] } };
        }

        return result.winner === null
            ? { key: this.key(marker('table.result.draw', undefined, 'poker')), params: { chips: result.stacks[0] } }
            : { key: this.key(marker('table.result.win', undefined, 'poker')), params: { winner: players[result.winner], chips: result.stacks[result.winner] } };
    }

    private verificationText(verification: DeckVerification): TranslatableText | null {
        switch (verification) {
            case DeckVerification.PENDING:
                return null;
            case DeckVerification.CHECKING:
                return { key: this.key(marker('table.verification.checking', undefined, 'poker')) };
            case DeckVerification.FAIR:
                return { key: this.key(marker('table.verification.fair', undefined, 'poker')) };
            case DeckVerification.CHEATED:
                return { key: this.key(marker('table.verification.cheated', undefined, 'poker')) };
        }
    }

    /** The dealer the next hand waits for */
    private dealStatus(): TranslatableText {
        const dealer: PokerSeat = this.session().match().dealer();

        return dealer === this.session().mySeat()
            ? { key: this.key(marker('table.status.myDeal', undefined, 'poker')) }
            : { key: this.key(marker('table.status.theirDeal', undefined, 'poker')), params: { name: this.session().seats()[dealer] } };
    }

    /** The players the deck of the hand waits for */
    private deckStatus(deck: MentalDeck): TranslatableText {
        const name: string = deck.waitingFor().join(', ');

        if (deck.phase() !== DeckPhase.READY) {
            return { key: this.key(marker('table.status.shuffling', undefined, 'poker')), params: { name } };
        }

        // Every key in the chain: the players read their cards
        return name === ''
            ? { key: this.key(marker('table.status.reading', undefined, 'poker')) }
            : { key: this.key(marker('table.status.keys', undefined, 'poker')), params: { name } };
    }

    /** The player the hand waits for */
    private turnStatus(hand: PokerHand): TranslatableText {
        const toAct: PokerSeat | null = this.toAct();

        if (toAct === null) {
            return { key: this.key(marker('table.status.showdown', undefined, 'poker')) };
        }

        if (toAct === this.session().mySeat() && this.hurry()) {
            return hand.phase === HandPhase.EXCHANGE
                ? { key: this.key(marker('table.status.myExchangeEnding', undefined, 'poker')) }
                : { key: this.key(marker('table.status.myTurnEnding', undefined, 'poker')) };
        }

        if (toAct === this.session().mySeat()) {
            return hand.phase === HandPhase.EXCHANGE
                ? { key: this.key(marker('table.status.myExchange', undefined, 'poker')) }
                : { key: this.key(marker('table.status.myTurn', undefined, 'poker')) };
        }

        const name: string | null = this.session().seats()[toAct];
        return hand.phase === HandPhase.EXCHANGE
            ? { key: this.key(marker('table.status.theirExchange', undefined, 'poker')), params: { name } }
            : { key: this.key(marker('table.status.theirTurn', undefined, 'poker')), params: { name } };
    }

    /** The chips moved fly between the places of the table, as it shows them now */
    private flightsOf(transfers: ReadonlyArray<Readonly<ChipTransfer>>): ReadonlyArray<Readonly<ChipFlight>> {
        // A hidden page does not run its animations: its flights would all fly at once when shown again
        if (transfers.length === 0 || !untracked(this.pageVisibility.visible)) {
            return [];
        }

        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        return transfers.map(({ from, to, amount }): ChipFlight => ({ id: this.nextFlight++, amount, from: this.point(from, origin), to: this.point(to, origin) }));
    }

    /** The middle of a place of the table, the right side of the cloth for the bank */
    private point(place: ChipPlace, origin: DOMRect): TablePoint {
        const rect: DOMRect = this.element(place).getBoundingClientRect();
        const x: number = place.kind === ChipPlaceKind.BANK ? rect.right - BANK_INSET : rect.left + rect.width / 2;
        return { x: x - origin.left, y: rect.top + rect.height / 2 - origin.top };
    }

    private element(place: ChipPlace): HTMLElement {
        switch (place.kind) {
            case ChipPlaceKind.STACK:
                return (place.seat === this.topSeat() ? this.topSeatView() : this.bottomSeatView()).chipsPlace();
            case ChipPlaceKind.BET:
                return (place.seat === this.topSeat() ? this.topBetView() : this.bottomBetView()).element;
            case ChipPlaceKind.POT:
                return this.potView().element;
            case ChipPlaceKind.BANK:
                return this.clothView().nativeElement;
        }
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.POKER, key);
    }
}
