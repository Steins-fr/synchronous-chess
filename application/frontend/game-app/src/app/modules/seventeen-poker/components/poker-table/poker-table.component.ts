import {
    afterRenderEffect, Component, computed, effect, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, signal, untracked, viewChild,
    WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { DeckVerification, MentalDeck } from '@app/modules/mental-poker/classes/mental-deck';
import { DeckPhase } from '@app/modules/mental-poker/classes/mental-deck-state';
import { CardDeckComponent } from '@app/modules/playing-cards/components/card-deck/card-deck.component';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { ChipFlight, ChipFlightsComponent } from '@app/modules/two-seat-table/components/chip-flights/chip-flights.component';
import { middle, TablePoint } from '@app/modules/two-seat-table/helpers/table-point.helper';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { scopedKey } from '@app/services/language/scoped-key';
import { Room } from '@app/services/room-manager/classes/room/room';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { PlayedMatch, PokerPayloads, PokerSessionOptions, SeatCard, SeventeenPokerSession } from '../../classes/game-sessions/seventeen-poker-session';
import { handOutcomeText } from '../../helpers/hand-outcome-text.helper';
import { ChipPlace, ChipPlaceKind, chipTransfers, ChipTransfer, TableChips } from '../../helpers/chip-transfers.helper';
import { HAND_ENDING, HeardTable, tableSounds, TimedSound } from '../../helpers/table-sound.helper';
import { BetAction, BetLimits } from '../../classes/rules/betting-round';
import { HAND_SIZE, HandValue } from '../../classes/rules/hand-evaluator';
import { HandEnd, HandOutcome, HandPhase, MatchResult, PokerHand, PokerMatch } from '../../classes/rules/poker-match';
import { otherSeat, PokerSeat, SeatPair } from '../../classes/rules/poker-seat';
import { PokerSeatComponent } from '../poker-seat/poker-seat.component';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';

/** The options of the session of the table: the cipher and the rules of the app, lighter ones for the specs */
export const POKER_SESSION_OPTIONS = new InjectionToken<PokerSessionOptions>('POKER_SESSION_OPTIONS', { factory: (): PokerSessionOptions => ({}) });

/**
 * The milliseconds the deck of a new hand shows shuffled at least, the length of the sound of its shuffle: its cards are
 * dealt once it is over. None in the specs
 */
export const SHUFFLE_HOLD = new InjectionToken<number>('SHUFFLE_HOLD', { factory: (): number => 3100 });

/** The chips a click on more or less adds to the amount of a bet */
const BET_STEP: number = 5;

/** The bank, off the table: the chips going to it fly to the right side of the cloth, this far inside it */
const BANK_INSET: number = 16;

/** The table of the Seventeen Poker: the seats, the hands, the deck and the pot, and the actions of the local player */
@Component({
    selector: 'app-poker-table',
    templateUrl: './poker-table.component.html',
    styleUrl: './poker-table.component.scss',
    imports: [CardDeckComponent, CardHandComponent, ChipFlightsComponent, ChipStackComponent, MatButtonModule, PokerSeatComponent, SteadyHeightDirective, TranslocoDirective, TranslocoPipe],
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
    private readonly shuffleHold: number = inject(SHUFFLE_HOLD);
    private shuffleTimer?: ReturnType<typeof setTimeout>;
    /**
     * The latest deck the table showed shuffled: a deck dealt live once the sound of its shuffle is over, a deck of the
     * history of the room, or already dealt when the page opens, at once
     */
    private readonly shuffledDeck = signal<string | null>(null);
    /** The deck of the hand shows shuffled: its cards, the actions and the clock wait for it */
    private readonly held: Signal<boolean> = computed((): boolean => {
        const deck: string | undefined = this.session().deck()?.id;
        return deck !== undefined && deck !== this.shuffledDeck();
    });

    /** The local player plays the match: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.session().inMatch()));

    protected readonly betAction: typeof BetAction = BetAction;
    protected readonly seatOne: PokerSeat = PokerSeat.ONE;
    protected readonly seatTwo: PokerSeat = PokerSeat.TWO;

    /** The seat at the bottom of the table: the one of the local player, the first one for a spectator */
    protected readonly bottomSeat: Signal<PokerSeat> = computed((): PokerSeat => this.session().tableSeats.bottomSeat());
    protected readonly topSeat: Signal<PokerSeat> = computed((): PokerSeat => this.session().tableSeats.topSeat());

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
        const held: boolean = this.held();
        return this.session().cards().map((cards: ReadonlyArray<Readonly<SeatCard>>, seat: number) => {
            return matchSeats[seat] && !held ? cards.map(({ position, card }) => ({ id: `${ deckId }:${ position }`, card })) : [];
        });
    });

    /** The ids of the cards of the local player selected to discard */
    protected readonly selected: WritableSignal<ReadonlyArray<string>> = signal<ReadonlyArray<string>>([]);

    protected readonly hand: Signal<PokerHand | null> = computed((): PokerHand | null => this.session().match().hand());
    protected readonly exchanging: Signal<boolean> = computed((): boolean => this.session().myTurn() && !this.held() && this.hand()?.phase === HandPhase.EXCHANGE);
    protected readonly betting: Signal<boolean> = computed((): boolean => this.session().myTurn() && !this.held() && this.hand()?.phase !== HandPhase.EXCHANGE);
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

    /** A seated player starts a new match once the former one is over, or stopped by a broken deck, both seats taken */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: SeventeenPokerSession = this.session();
        return session.mySeat() !== null && !session.seats().includes(null) && session.over() && !session.sending();
    });

    /** The seat whose player acts, which the table shows */
    protected readonly toAct: Signal<PokerSeat | null> = computed((): PokerSeat | null => {
        const hand: PokerHand | null = this.hand();

        if (hand === null || this.session().dealing() || this.session().broken() || this.held()) {
            return null;
        }

        return this.session().match().toAct();
    });

    /** A seated player is away: the table waits for it, the clock of the move running */
    private readonly waiting: Signal<boolean> = computed((): boolean => this.session().awayPlayers().length > 0);
    // Each move has its time, from when the page sees it, a new one at each action (a seat acting twice in a row too):
    // once over, the page of its player plays for it, or the page of the other player ends the match while it is away
    /** The seconds left to the player to act for its move */
    protected readonly timeLeft: Signal<number | null> = turnClock({
        running: () => this.hand() !== null && this.toAct() !== null,
        times: () => this.session().match().rules,
        away: this.waiting,
        timeOut: () => this.timeOut(),
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

    /** The chips on the table, as it shows them: the stacks, the bets and the pot */
    private readonly tableChips: Signal<Readonly<TableChips>> = computed((): Readonly<TableChips> =>
        ({ stacks: this.session().match().stacks(), bets: this.bets(), pot: this.potChips() }));

    /** The outcome of the hand over, until the next one is dealt */
    protected readonly outcome: Signal<Readonly<HandOutcome> | null> = computed((): Readonly<HandOutcome> | null => {
        const hand: PokerHand | null = this.hand();
        return hand?.phase === HandPhase.OVER ? hand.outcome : null;
    });

    /** The hand over showed its end before its pot flies: the cards turned at the showdown, or the hand folded faded */
    protected readonly handEnding: Signal<boolean> = computed((): boolean => {
        const outcome: Readonly<HandOutcome> | null = this.outcome();
        return outcome !== null && outcome.end !== HandEnd.NO_CONTEST;
    });

    /** The kind of hand of each seat, once shown */
    protected readonly categories: Signal<SeatPair<TranslatableText | null>> = computed((): SeatPair<TranslatableText | null> => {
        const hands: SeatPair<HandValue> | null | undefined = this.outcome()?.hands;
        const of = (seat: PokerSeat): TranslatableText | null => hands && this.matchSeats()[seat] ? { key: this.key(marker('table.category', undefined, 'poker')), params: { category: hands[seat].category } } : null;
        return [of(PokerSeat.ONE), of(PokerSeat.TWO)];
    });

    /** The deck is being shuffled and locked */
    protected readonly shuffling: Signal<boolean> = computed((): boolean => {
        const phase: DeckPhase | undefined = this.session().deck()?.phase();
        return phase === DeckPhase.SHUFFLING || phase === DeckPhase.LOCKING || this.held();
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

        // A free seat, once a broken deck stopped the match too: the table waits for a player
        if (session.seats().includes(null)) {
            return { key: this.key(marker('table.status.seats', undefined, 'poker')) };
        }

        if (session.broken()) {
            return { key: this.key(marker('table.status.broken', undefined, 'poker')) };
        }

        // The local player to act plays while the other one is away
        if (this.waiting() && session.match().result() === null && !session.myTurn()) {
            return { key: this.key(marker('table.status.away', undefined, 'poker')), params: { name: session.awayPlayers().join(', ') } };
        }

        if (hand === null || hand.phase === HandPhase.OVER) {
            return session.match().result() === null ? this.dealStatus() : null;
        }

        // The deck of the dealer shows shuffled until the sound of its shuffle is over
        if (this.held()) {
            return { key: this.key(marker('table.status.shuffling', undefined, 'poker')), params: { name: session.seats()[otherSeat(hand.first)] } };
        }

        // A hand in progress has its deck
        const deck: MentalDeck = session.deck() as MentalDeck;
        return deck.phase() !== DeckPhase.READY || session.dealing() ? this.deckStatus(deck) : this.turnStatus(hand);
    });

    /** The outcome of each hand played in the match, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const players: SeatPair<string | null> = this.session().players();
        return this.session().match().outcomes().map((outcome: Readonly<HandOutcome>, index: number) => handOutcomeText(outcome, index, players)).reverse();
    });

    /** The result of each match over before the one in progress, by its number in the room, then the check of its decks, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> => {
        return this.session().pastMatches().map((played: Readonly<PlayedMatch>, index: number): PastResult => ({
            number: index + 1,
            label: { key: this.key(marker('table.match', undefined, 'poker')), params: { number: index + 1 } },
            text: this.resultText(played),
            verification: this.verificationText(played.verification()),
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

    protected readonly verification: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const session: SeventeenPokerSession = this.session();

        // A free seat takes the status of a match stopped by a broken deck: the note tells the cheat then
        if (session.broken() && session.seats().includes(null)) {
            return this.verificationText(DeckVerification.CHEATED);
        }

        return this.verificationText(session.verification());
    });

    // The places of the chips on the table
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly clothView: Signal<ElementRef<HTMLElement>> = viewChild.required('cloth');
    private readonly potView: Signal<ChipStackComponent> = viewChild.required('potStack');
    private readonly topBetView: Signal<ChipStackComponent> = viewChild.required('topBet');
    private readonly bottomBetView: Signal<ChipStackComponent> = viewChild.required('bottomBet');
    private readonly topSeatView: Signal<PokerSeatComponent> = viewChild.required('topSeatView');
    private readonly bottomSeatView: Signal<PokerSeatComponent> = viewChild.required('bottomSeatView');
    /** The chips moved by the latest change of the table, flying over it */
    private readonly chipFlights: Signal<ChipFlightsComponent> = viewChild.required('chipFlights');

    private readonly pageVisibility: PageVisibilityService = inject(PageVisibilityService);

    /** The chips on the table last shown, with their session, its match, the steps of its history applied then and the hands over */
    private shown: { readonly session: SeventeenPokerSession; readonly match: PokerMatch; readonly chips: Readonly<TableChips>; readonly historySteps: number; readonly outcomes: number } | null = null;

    // Once the table shows a change, the chips it moved fly from where they were to where they are: the pot of a showdown or
    // of a fold once the end of the hand showed, the cards turned over or the hand folded faded
    private readonly chipMoves = afterRenderEffect({
        earlyRead: (): ReadonlyArray<Readonly<ChipFlight>> => {
            const session: SeventeenPokerSession = this.session();
            const match: PokerMatch = session.match();
            const chips: Readonly<TableChips> = this.tableChips();
            const historySteps: number = session.historySteps();
            const outcomes: ReadonlyArray<Readonly<HandOutcome>> = match.outcomes();
            // A new session or a new match starts from its own chips, and the history of the room it catches up with moves none
            const previous: typeof this.shown = this.shown?.session === session && this.shown.match === match && this.shown.historySteps === historySteps
                ? this.shown
                : null;
            const transfers: ReadonlyArray<Readonly<ChipTransfer>> = previous === null ? [] : chipTransfers(previous.chips, chips);
            const ending: boolean = previous !== null && outcomes.length > previous.outcomes && outcomes.at(-1)?.end !== HandEnd.NO_CONTEST;
            this.shown = { session, match, chips, historySteps, outcomes: outcomes.length };
            return this.flightsOf(transfers, ending ? HAND_ENDING * 1000 : 0);
        },
        write: (flights: Signal<ReadonlyArray<Readonly<ChipFlight>>>): void => {
            this.chipFlights().launch(flights());
        },
    });

    private readonly soundService = inject(SoundService);
    /** The table the page last heard, with its session, its match and the steps of its history applied then */
    private heard: { readonly session: SeventeenPokerSession; readonly match: PokerMatch; readonly table: Readonly<HeardTable>; readonly historySteps: number } | null = null;

    // A change of the table plays its sounds on every page, a hidden one included. A new session or a new match starts
    // from its own table, and the history of the room it catches up with plays none. The deck of a new hand shows shuffled
    // as long as the sound of its shuffle, its cards dealt then
    private readonly sounds = effect(() => {
        const session: SeventeenPokerSession = this.session();
        const match: PokerMatch = session.match();
        const historySteps: number = session.historySteps();
        const deck: string | null = session.deck()?.id ?? null;
        const previous: typeof this.heard = this.heard;
        const caughtUp: boolean = previous !== null && previous.session === session && previous.match === match && previous.historySteps === historySteps;
        // A deck of the history, or already dealt, shows at once: before the hands are read
        if (!caughtUp) {
            this.shuffledDeck.set(deck);
        }
        // A new session loads ahead the files of the sounds of the table: their first play is not late
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.POKER_SHUFFLE, SoundEffect.POKER_DEAL, SoundEffect.POKER_CARD_TURN, SoundEffect.CHIPS, SoundEffect.POKER_FOLD]);
        }
        const table: Readonly<HeardTable> = {
            seats: session.seats(),
            deck,
            // The cards of the hands, once the deck showed shuffled: a player leaving its seat and taking it back deals none
            hands: this.held() ? [] : session.cards().map((cards: ReadonlyArray<Readonly<SeatCard>>) => cards.map(({ position }) => `${ deck }:${ position }`)),
            chips: this.tableChips(),
            outcomes: match.outcomes(),
            result: match.result(),
        };
        this.heard = { session, match, table, historySteps };

        if (previous === null || !caughtUp) {
            return;
        }

        const mySeat: PokerSeat | null = untracked(session.mySeat);
        untracked(() => tableSounds(previous.table, table, mySeat).forEach(({ effect: sound, delay }: TimedSound) => this.soundService.play(sound, delay)));
        if (deck !== previous.table.deck) {
            this.showShuffled(deck);
        }
    });

    /** The deck dealt live shows shuffled until the sound of its shuffle is over */
    private showShuffled(deck: string | null): void {
        // The deck of a hand replaces the one of the hand before
        clearTimeout(this.shuffleTimer);
        this.shuffleTimer = setTimeout(() => this.shuffledDeck.set(deck), this.shuffleHold);
    }

    public ngOnDestroy(): void {
        clearTimeout(this.shuffleTimer);
        this.session().destroy();
    }

    /** The chips the player of a seat won in the hand over, while it keeps the seat */
    protected gain(seat: PokerSeat): number {
        return this.matchSeats()[seat] ? this.outcome()?.gains[seat] ?? 0 : 0;
    }

    /** Whether the hand of a seat lost, at the showdown or folded: it fades */
    protected losing(seat: PokerSeat): boolean {
        const outcome: Readonly<HandOutcome> | null = this.outcome();
        return outcome !== null && outcome.winner === otherSeat(seat);
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
        if (this.session().tableSeats.canRelease(seat)) {
            this.session().unseat(seat);
        }
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
        if (result === null) {
            return { key: this.key(marker('table.result.stopped', undefined, 'poker')) };
        }

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

    /** The chips moved fly between the places of the table, as it shows them now, once the delay is over, in milliseconds */
    private flightsOf(transfers: ReadonlyArray<Readonly<ChipTransfer>>, delay: number): ReadonlyArray<Readonly<ChipFlight>> {
        // A hidden page does not run its animations: its flights would all fly at once when shown again
        if (transfers.length === 0 || !untracked(this.pageVisibility.visible)) {
            return [];
        }

        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        return transfers.map(({ from, to, amount }): ChipFlight => ({ amount, from: this.point(from, origin), to: this.point(to, origin), delay }));
    }

    /** The middle of a place of the table, the right side of the cloth for the bank */
    private point(place: ChipPlace, origin: DOMRect): TablePoint {
        const rect: DOMRect = this.element(place).getBoundingClientRect();
        const center: TablePoint = middle(rect, origin);
        return place.kind === ChipPlaceKind.BANK ? { ...center, x: rect.right - BANK_INSET - origin.left } : center;
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
