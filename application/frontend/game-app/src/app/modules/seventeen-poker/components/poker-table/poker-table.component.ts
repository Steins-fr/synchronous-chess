import {
    afterRenderEffect, Component, computed, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, signal, untracked, viewChild,
    WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { DeckVerification, MentalDeck } from '@app/modules/mental-poker/classes/mental-deck';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { CardDeckComponent } from '@app/modules/playing-cards/components/card-deck/card-deck.component';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PokerPayloads, PokerSessionOptions, SeatCard, SeventeenPokerSession } from '../../classes/game-sessions/seventeen-poker-session';
import { handOutcomeText } from '../../helpers/hand-outcome-text.helper';
import { ChipPlace, ChipPlaceKind, chipTransfers, ChipTransfer, TableChips } from '../../helpers/chip-transfers.helper';
import { BetAction, BetLimits } from '../../classes/rules/betting-round';
import { HAND_SIZE, HandValue } from '../../classes/rules/hand-evaluator';
import { HandEnd, HandOutcome, HandPhase, MatchResult, PokerHand } from '../../classes/rules/poker-match';
import { otherSeat, PokerSeat, SeatPair } from '../../classes/rules/poker-seat';
import { PokerSeatComponent } from '../poker-seat/poker-seat.component';

/** The options of the session of the table: the cipher and the rules of the app, lighter ones for the specs */
export const POKER_SESSION_OPTIONS = new InjectionToken<PokerSessionOptions>('POKER_SESSION_OPTIONS', { factory: (): PokerSessionOptions => ({}) });

/** The chips a click on more or less adds to the amount of a bet */
const BET_STEP: number = 5;

/** The bank, off the table: the chips going to it fly to the right side of the cloth, this far inside it */
const BANK_INSET: number = 16;

/** A place of the table, from its top left corner */
interface TablePoint {
    readonly x: number;
    readonly y: number;
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

    /** The cards of each seat, as the hands show them */
    protected readonly hands: Signal<ReadonlyArray<ReadonlyArray<Readonly<HandCard>>>> = computed((): ReadonlyArray<ReadonlyArray<Readonly<HandCard>>> => {
        const deckId: string | undefined = this.session().deck()?.id;
        return this.session().cards().map((cards: ReadonlyArray<Readonly<SeatCard>>) => cards.map(({ position, card }) => ({ id: `${ deckId }:${ position }`, card })));
    });

    /** The ids of the cards of the local player selected to discard */
    protected readonly selected: WritableSignal<ReadonlyArray<string>> = signal<ReadonlyArray<string>>([]);

    protected readonly hand: Signal<PokerHand | null> = computed((): PokerHand | null => this.session().match.hand());
    protected readonly exchanging: Signal<boolean> = computed((): boolean => this.session().myTurn() && this.hand()?.phase === HandPhase.EXCHANGE);
    protected readonly betting: Signal<boolean> = computed((): boolean => this.session().myTurn() && this.hand()?.phase !== HandPhase.EXCHANGE);
    /** The most cards the local player discards: the cards left to draw */
    protected readonly maxExchange: Signal<number> = computed((): number => Math.min(HAND_SIZE, this.session().match.drawPile()));

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
        return session.mySeat() === session.match.dealer() && !session.seats().includes(null) && session.awayPlayers().length === 0 && !session.sending()
            && !session.broken() && session.match.result() === null && (hand === null || hand.phase === HandPhase.OVER);
    });

    /** The seat whose player acts, which the table shows */
    protected readonly toAct: Signal<PokerSeat | null> = computed((): PokerSeat | null => {
        const hand: PokerHand | null = this.hand();

        if (hand === null || this.session().dealing() || this.session().broken()) {
            return null;
        }

        return hand.phase === HandPhase.EXCHANGE ? this.session().match.exchanging() : hand.round.toAct;
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
        const of = (seat: PokerSeat): TranslatableText | null => hands ? { key: this.key(marker('table.category', undefined, 'poker')), params: { category: hands[seat].category } } : null;
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

        if (session.awayPlayers().length > 0 && session.match.result() === null) {
            return { key: this.key(marker('table.status.away', undefined, 'poker')), params: { name: session.awayPlayers().join(', ') } };
        }

        if (hand === null || hand.phase === HandPhase.OVER) {
            return session.match.result() === null ? this.dealStatus() : null;
        }

        // A hand in progress has its deck
        const deck: MentalDeck = session.deck() as MentalDeck;
        return deck.phase() !== DeckPhase.READY || session.dealing() ? this.deckStatus(deck) : this.turnStatus(hand);
    });

    /** The outcome of each hand played, the latest first */
    protected readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const seats: SeatPair<string | null> = this.session().seats();
        return this.session().match.outcomes().map((outcome: Readonly<HandOutcome>, index: number) => handOutcomeText(outcome, index, seats)).reverse();
    });

    /** The outcome of the hand over, on the cloth */
    protected readonly outcomeText: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const outcome: Readonly<HandOutcome> | null = this.outcome();
        return outcome === null ? null : handOutcomeText(outcome, (this.hand() as PokerHand).index, this.session().seats());
    });

    protected readonly result: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const result: MatchResult | null = this.session().match.result();

        if (result === null) {
            return null;
        }

        return result.winner === null
            ? { key: this.key(marker('table.result.draw', undefined, 'poker')), params: { chips: result.stacks[0] } }
            : { key: this.key(marker('table.result.win', undefined, 'poker')), params: { winner: this.session().seats()[result.winner], chips: result.stacks[result.winner] } };
    });

    protected readonly verification: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        switch (this.session().verification()) {
            case DeckVerification.PENDING:
                return null;
            case DeckVerification.CHECKING:
                return { key: this.key(marker('table.verification.checking', undefined, 'poker')) };
            case DeckVerification.FAIR:
                return { key: this.key(marker('table.verification.fair', undefined, 'poker')) };
            case DeckVerification.CHEATED:
                return { key: this.key(marker('table.verification.cheated', undefined, 'poker')) };
        }
    });

    // The places of the chips on the table
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly clothView: Signal<ElementRef<HTMLElement>> = viewChild.required('cloth');
    private readonly potView: Signal<ChipStackComponent> = viewChild.required('potStack');
    private readonly topBetView: Signal<ChipStackComponent> = viewChild.required('topBet');
    private readonly bottomBetView: Signal<ChipStackComponent> = viewChild.required('bottomBet');
    private readonly topSeatView: Signal<PokerSeatComponent> = viewChild.required('topSeatView');
    private readonly bottomSeatView: Signal<PokerSeatComponent> = viewChild.required('bottomSeatView');

    /** The chips on the table last shown, with their session */
    private shown: { readonly session: SeventeenPokerSession; readonly chips: Readonly<TableChips> } | null = null;

    // Once the table shows a change, the chips it moved fly from where they were to where they are
    private readonly chipMoves = afterRenderEffect({
        earlyRead: (): ReadonlyArray<Readonly<ChipFlight>> => {
            const session: SeventeenPokerSession = this.session();
            const chips: Readonly<TableChips> = { stacks: session.match.stacks(), bets: this.bets(), pot: this.potChips() };
            // A new session starts from its own chips
            const transfers: ReadonlyArray<Readonly<ChipTransfer>> = this.shown?.session === session ? chipTransfers(this.shown.chips, chips) : [];
            this.shown = { session, chips };
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
        this.chipMoves.destroy();
        this.session().destroy();
    }

    /** A participant without a seat takes a free one before the first hand */
    protected canTake(seat: PokerSeat): boolean {
        const session: SeventeenPokerSession = this.session();
        return session.seatsOpen() && session.seats()[seat] === null && session.mySeat() === null;
    }

    /** The local player leaves its seat, at the bottom of the table, before the first hand */
    protected canLeave(): boolean {
        return this.session().seatsOpen() && this.session().mySeat() !== null;
    }

    /** The chips the player of a seat won in the hand over */
    protected gain(seat: PokerSeat): number {
        return this.outcome()?.gains[seat] ?? 0;
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

    /** A click on a button the page did not hide yet (a second click, the turn over meanwhile) does nothing */
    protected deal(): void {
        if (this.canDeal()) {
            this.session().deal();
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

    /** The dealer the next hand waits for */
    private dealStatus(): TranslatableText {
        const dealer: PokerSeat = this.session().match.dealer();

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
        if (transfers.length === 0) {
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
