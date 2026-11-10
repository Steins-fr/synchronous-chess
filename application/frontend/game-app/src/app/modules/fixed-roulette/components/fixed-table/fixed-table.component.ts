import {
    afterRenderEffect, Component, computed, effect, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, untracked, viewChild, WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { applyEach, form, min, required, schema, Schema, submit, validate, ValidationError } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { SeatPair } from '@app/helpers/seat-pair.helper';
import { canRematchOf, pastResultsOf, watchMatch } from '@app/modules/commit-reveal/helpers/commit-reveal-table.helper';
import { phaseClock, PhaseClock } from '@app/modules/commit-reveal/helpers/phase-clock.helper';
import { setupTimeOf, setupTimeOptions } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { ChoiceFieldComponent, ChoiceOption } from '@app/modules/form/choice-field/choice-field.component';
import { FormErrorComponent } from '@app/modules/form/form-error/form-error.component';
import { NumberFieldComponent } from '@app/modules/form/number-field/number-field.component';
import { ChipFlight, ChipFlightsComponent } from '@app/modules/game-table/components/chip-flights/chip-flights.component';
import { middle, TablePoint } from '@app/modules/game-table/helpers/table-point.helper';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { PrivateConversations } from '@app/modules/private-conversations/classes/private-conversations';
import { PrivatePayloads } from '@app/modules/private-conversations/classes/private-messages';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { map, switchMap } from 'rxjs';
import { FixedRoulettePayloads } from '../../classes/game-sessions/fixed-roulette-messages';
import { FixedRouletteSession, FixedRouletteSessionOptions } from '../../classes/game-sessions/fixed-roulette-session';
import {
    FixedRouletteEvent, FixedRouletteEventKind, FixedRouletteGameState, FixedRoulettePhase, FixedRouletteResult,
} from '../../classes/rules/fixed-roulette-game-state';
import { Bets, BetError, betError, FixedRouletteRules, punterMinimum, Side, sideOf, totalOf } from '../../classes/rules/fixed-roulette-rules';
import { PlacedBets, pocketStakes } from '../../classes/rules/settlement';
import { betTransfers, ChipPlace, ChipPlaceKind, ChipTransfer, settlementTransfers, voidTransfers } from '../../helpers/chip-transfers.helper';
import { eventText, GameOverEvent, isGameOver, resultText } from '../../helpers/fixed-texts.helper';
import { BALL_DROP, HeardFixedTable, tableSounds, TimedSound } from '../../helpers/table-sound.helper';
import { FixedSeatComponent } from '../fixed-seat/fixed-seat.component';
import { BallKind, FixedWheelComponent, ShownBall, StakeRow } from '../fixed-wheel/fixed-wheel.component';

/** The options of the session of the table: the rules of the game, lighter ones for the specs */
export const FIXED_ROULETTE_SESSION_OPTIONS = new InjectionToken<FixedRouletteSessionOptions>('FIXED_ROULETTE_SESSION_OPTIONS', {
    factory: (): FixedRouletteSessionOptions => ({}),
});

const key = (text: string): string => scopedKey(TranslationScope.FIXED, text);

/** The rules of the chips typed on a pocket: whole chips, none below 0. An empty field bets no chip */
const STAKE: Schema<number | null> = schema<number | null>((stake) => {
    min(stake, 0, { message: key(marker('table.bets.min', undefined, 'fixed')) });
    validate(stake, ({ value }) => value() === null || Number.isInteger(value())
        ? undefined
        : { kind: 'integer', message: key(marker('table.bets.integer', undefined, 'fixed')) });
});

/** The message of each error of the bets of a form */
const BET_ERRORS: Readonly<Record<BetError, string>> = {
    [BetError.NONE]: key(marker('table.bets.error.none', undefined, 'fixed')),
    [BetError.OVER]: key(marker('table.bets.error.over', undefined, 'fixed')),
    [BetError.POCKETS]: key(marker('table.bets.error.pockets', undefined, 'fixed')),
    [BetError.ALL_IN]: key(marker('table.bets.error.allIn', undefined, 'fixed')),
    [BetError.UNDER]: key(marker('table.bets.error.under', undefined, 'fixed')),
};

/** The ball the croupier places and the chips it bets on each pocket, the first pocket first: null while a field is empty */
interface PlaceModel {
    readonly pocket: string;
    readonly chips: ReadonlyArray<number | null>;
}

/** The chips the punter bets on each pocket */
interface BetModel {
    readonly chips: ReadonlyArray<number | null>;
}

/** Bets a form refuses: the values its message reads */
interface BetsError extends ValidationError {
    /** The chips the local player holds */
    readonly chips: number;
    /** The least the punter bets */
    readonly minimum: number;
    /** The most pockets the punter covers */
    readonly pockets: number;
    /** The croupier of the game */
    readonly name: string | null;
}

type PlacedEvent = Extract<FixedRouletteEvent, { readonly kind: FixedRouletteEventKind.PLACED }>;
type BetEvent = Extract<FixedRouletteEvent, { readonly kind: FixedRouletteEventKind.BET }>;

/** A seat of the table, as it shows */
interface SeatView {
    readonly seat: number;
    readonly name: string | null;
    /** Its player plays the match, by its index in it: the players of a match sit in the order of their seats */
    readonly player: number | null;
    readonly awaited: boolean;
    readonly side: Side | null;
    readonly chips: number | null;
}

/** The result of the match, once over */
interface ResultView {
    readonly text: TranslatableText;
    readonly draw: boolean;
}

/**
 * The table of the Fixed Roulette: the seat of the other player above, the cloth with the bank, the fixed wheel and the
 * bets on each pocket, and the game over last, the seat of the local player below, then what the table waits for and the
 * forms of the croupier and of the punter. Before the match, the player starting it picks the time of the bets. The
 * table holds the private conversations of the room, the match declaring the one of its players
 */
@Component({
    selector: 'app-fixed-table',
    templateUrl: './fixed-table.component.html',
    imports: [
        ChipFlightsComponent, ChoiceFieldComponent, FixedSeatComponent, FixedWheelComponent, FormErrorComponent, MatButtonModule, NumberFieldComponent,
        SteadyHeightDirective, TranslocoDirective, TranslocoPipe,
    ],
    host: { class: 'block max-w-[1100px] mx-auto px-4' },
})
export class FixedTableComponent implements OnDestroy {
    public readonly room = input.required<Room<FixedRoulettePayloads & PrivatePayloads>>();
    private readonly options: FixedRouletteSessionOptions = inject(FIXED_ROULETTE_SESSION_OPTIONS);
    private readonly soundService: SoundService = inject(SoundService);
    private readonly pageVisibility: PageVisibilityService = inject(PageVisibilityService);

    protected readonly session: Signal<FixedRouletteSession> = computed((): FixedRouletteSession => {
        const room: Room<FixedRoulettePayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new FixedRouletteSession(room, this.options));
    });
    /** The private conversations of the room, for its life: the page offers them in the panel of the room */
    public readonly conversations: Signal<PrivateConversations> = computed((): PrivateConversations => {
        const room: Room<PrivatePayloads> = this.room();
        return untracked(() => new PrivateConversations(room));
    });
    /** The local player plays the match, not over: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = watchMatch(this.session);

    protected readonly game: Signal<FixedRouletteGameState | null> = computed((): FixedRouletteGameState | null => this.session().game());

    /** The time of the bets the local player picks before starting the match */
    private readonly setupModel: WritableSignal<Readonly<{ betTime: string }>> = linkedSignal({
        source: this.session,
        computation: (session: FixedRouletteSession) => ({ betTime: String(session.rules.defaultBetTime) }),
    });
    protected readonly setupForm = form(this.setupModel, { name: 'fixed-setup' });
    protected readonly betTimes: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        setupTimeOptions(this.session().rules.betTimes));

    /** The ball and the bets the croupier types, none for each game */
    private readonly placeModel: WritableSignal<Readonly<PlaceModel>> = linkedSignal({
        source: () => this.clock.roundKey(),
        computation: (): PlaceModel => ({ pocket: '', chips: this.emptyChips() }),
    });
    protected readonly placeForm = form(this.placeModel, (path) => {
        required(path.pocket, { message: key(marker('table.place.required', undefined, 'fixed')) });
        applyEach(path.chips, STAKE);
        validate(path, ({ value }) => this.betsError(Side.CROUPIER, value().chips));
    }, { name: 'fixed-place' });
    /** The bets the punter types, none for each game */
    private readonly betModel: WritableSignal<Readonly<BetModel>> = linkedSignal({
        source: () => this.clock.roundKey(),
        computation: (): BetModel => ({ chips: this.emptyChips() }),
    });
    protected readonly betForm = form(this.betModel, (path) => {
        applyEach(path.chips, STAKE);
        validate(path, ({ value }) => this.betsError(Side.PUNTER, value().chips));
    }, { name: 'fixed-bet' });
    /** The pockets the croupier places the ball in */
    protected readonly pocketOptions: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        Array.from({ length: this.session().rules.pockets }, (_, index: number): ChoiceOption => ({
            value: String(index + 1),
            label: { key: key(marker('table.place.option', undefined, 'fixed')), params: { pocket: index + 1 } },
        })));
    /** What the punter bets at least, and on how many pockets at most */
    protected readonly betHint: Signal<TranslatableText> = computed((): TranslatableText => {
        const total: number = this.croupierTotal();
        return {
            key: key(marker('table.bets.hint', undefined, 'fixed')),
            params: {
                name: this.session().croupier(), total, allIn: (this.session().myChips() as number) < total ? 'yes' : 'no', pockets: this.session().rules.punterPockets,
            },
        };
    });

    /** The seat of the local player at the bottom; for a spectator, the first free seat while the seats are open, else the first seat */
    protected readonly bottomSeat: Signal<Readonly<SeatView>> = computed((): Readonly<SeatView> => this.seatView(this.session().tableSeats.bottomSeat()));
    protected readonly topSeat: Signal<Readonly<SeatView>> = computed((): Readonly<SeatView> => this.seatView(1 - this.session().tableSeats.bottomSeat()));

    /** The chips of the players on each pocket: the player of the top seat, then the one of the bottom seat */
    protected readonly stakes: Signal<ReadonlyArray<SeatPair<number>>> = computed((): ReadonlyArray<SeatPair<number>> => {
        const game: FixedRouletteGameState | null = this.game();
        const rules: FixedRouletteRules = this.session().rules;

        if (game === null) {
            return Array.from({ length: rules.pockets }, (): SeatPair<number> => [0, 0]);
        }
        const stakes: ReadonlyArray<SeatPair<number>> = pocketStakes(rules, game.bets(), game.croupier());
        return this.topSeat().seat === 0 ? stakes : stakes.map(([first, second]: SeatPair<number>): SeatPair<number> => [second, first]);
    });
    protected readonly wheelNames: Signal<SeatPair<string>> = computed((): SeatPair<string> => [this.topSeat().name ?? '', this.bottomSeat().name ?? '']);
    /** The chips the bank took in the match */
    protected readonly bank: Signal<number> = computed((): number => this.game()?.bank() ?? 0);

    /**
     * The ball the wheel shows: the one the local player sealed, on its page only, until it is revealed; then the ball of
     * the game settled last, until the croupier of the next game places its own
     */
    protected readonly ball: Signal<Readonly<ShownBall> | null> = computed((): Readonly<ShownBall> | null => {
        const mine: number | null = this.session().myBall();

        if (mine !== null) {
            return { pocket: mine, kind: BallKind.SEALED };
        }
        const last: Readonly<FixedRouletteEvent> | undefined = this.game()?.events().at(-1);
        return last?.kind === FixedRouletteEventKind.SETTLED ? { pocket: last.ball, kind: BallKind.LAST } : null;
    });

    /** The games over of the match: settled, or ending it on a player late or cheating */
    private readonly gamesOver: Signal<ReadonlyArray<Readonly<GameOverEvent>>> = computed((): ReadonlyArray<Readonly<GameOverEvent>> =>
        (this.game()?.events() ?? []).filter(isGameOver));
    /** The game over last, kept while the next one is played: no pause parts two games */
    protected readonly lastGame: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const last: Readonly<GameOverEvent> | undefined = this.gamesOver().at(-1);
        return last === undefined ? null : eventText(last, this.session().players());
    });

    /** What the match is at: the game and the time of the bets */
    protected readonly info: Signal<Readonly<{ game: TranslatableText; terms: TranslatableText }> | null> = computed(() => {
        const game: FixedRouletteGameState | null = this.game();

        if (game === null) {
            return null;
        }
        return {
            game: { key: key(marker('table.info.game', undefined, 'fixed')), params: { number: game.round() + 1, games: game.rules.games } },
            terms: { key: key(marker('table.info.terms', undefined, 'fixed')), params: setupTimeOf(game.setup.betTime) },
        };
    });

    /** The winner and why, or a draw, once the match is over */
    protected readonly result: Signal<Readonly<ResultView> | null> = computed((): Readonly<ResultView> | null => {
        const result: Readonly<FixedRouletteResult> | null = this.session().played().result();
        return result === null ? null : { text: resultText(result, this.session().players()), draw: result.winner === null };
    });

    /** A seated player starts a new match once the former one is over */
    protected readonly canRematch: Signal<boolean> = canRematchOf(this.session);

    /** The local player is the player the game waits for */
    private readonly myTurn: Signal<boolean> = computed((): boolean => this.session().canPlace() || this.session().canBet());
    /** The clock of the phase, for the player it waits for: the page claims its time once over */
    protected readonly clock: PhaseClock = phaseClock(this.session);

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText> = computed((): TranslatableText => {
        const session: FixedRouletteSession = this.session();
        const game: FixedRouletteGameState | null = this.game();

        if (!session.started()) {
            return this.startStatus();
        }
        if (game === null) {
            return { key: key(marker('table.status.drawing', undefined, 'fixed')), params: { names: session.awaited().join(', ') } };
        }
        if (session.over()) {
            return { key: key(marker('table.status.over', undefined, 'fixed')) };
        }
        if (this.myTurn() && this.clock.low()) {
            return { key: key(marker('table.status.hurry', undefined, 'fixed')) };
        }
        // The local player to act reads its own prompt
        if (this.clock.waitingAway() && !this.myTurn()) {
            return { key: key(marker('table.status.away', undefined, 'fixed')), params: { names: session.awaitedAway().join(', ') } };
        }
        return this.phaseStatus(game);
    });

    /** The games of the match over, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const names: ReadonlyArray<string> = this.session().players();
        return [...this.gamesOver()].reverse().map((event: Readonly<GameOverEvent>) => eventText(event, names));
    });

    /** The result of each match over before the one in progress, by its number in the room, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = pastResultsOf(this.session, key(marker('table.match', undefined, 'fixed')), resultText);

    /** The session caught up with the history of the room: the table hears the changes from there, and flies their chips */
    private liveSession: FixedRouletteSession | null = null;
    private heard: Readonly<{ session: FixedRouletteSession; game: FixedRouletteGameState | null; table: Readonly<HeardFixedTable> }> | null = null;
    private flown: Readonly<{ session: FixedRouletteSession; game: FixedRouletteGameState | null; events: number }> | null = null;
    private readonly heardTable: Signal<Readonly<HeardFixedTable>> = computed((): Readonly<HeardFixedTable> => {
        const session: FixedRouletteSession = this.session();
        return { seatsTaken: session.tableSeats.seatsTaken(), events: this.game()?.events() ?? [], result: session.played().result() };
    });

    // The places of the chips on the table: the stacks of the seats, the stakes on the wheel, the bank
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly topSeatView: Signal<FixedSeatComponent> = viewChild.required('topSeatView');
    private readonly bottomSeatView: Signal<FixedSeatComponent> = viewChild.required('bottomSeatView');
    private readonly wheel: Signal<FixedWheelComponent> = viewChild.required('wheel');
    private readonly bankView: Signal<ElementRef<HTMLElement>> = viewChild.required('bankView');
    /** The chips the moves moved, flying over the table */
    private readonly chipFlights: Signal<ChipFlightsComponent> = viewChild.required('chipFlights');

    // A session catches up with the history of the room before its first live message: the table hears the changes from there
    private readonly catchingUp = toObservable(this.session).pipe(
        switchMap((session: FixedRouletteSession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: FixedRouletteSession) => {
        this.liveSession = session;
        this.heard = { session, game: session.game(), table: this.heardTable() };
        this.flown = { session, game: session.game(), events: this.heardTable().events.length };
    });

    // A change of the table plays its sounds on every page, a hidden one included: a new match starts from an empty one
    private readonly sounds = effect(() => {
        const session: FixedRouletteSession = this.session();
        const game: FixedRouletteGameState | null = this.game();
        const table: Readonly<HeardFixedTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.SEAT_TAKEN, SoundEffect.CHIPS, SoundEffect.FIXED_BALL_DROP, SoundEffect.POKER_POT_WON, SoundEffect.POKER_POT_LOST]);
        }
        if (this.liveSession !== session || previous?.session !== session) {
            return;
        }
        const before: Readonly<HeardFixedTable> = previous.game === game ? previous.table : { ...previous.table, events: [], result: null };
        untracked(() => tableSounds(before, table, session.myIndex()).forEach(({ effect: sound, delay }: TimedSound) => this.soundService.play(sound, delay)));
    });

    // Once the table shows a move applied live, its chips fly: the bets from the stacks to the pockets, the chips of a game
    // settled, once the ball dropped, to their takers, the bets of a game void back to their owners. The history of the room
    // flies nothing
    private readonly flights = afterRenderEffect(() => {
        const session: FixedRouletteSession = this.session();
        const game: FixedRouletteGameState | null = this.game();
        const events: ReadonlyArray<Readonly<FixedRouletteEvent>> = this.heardTable().events;
        const previous: typeof this.flown = this.flown;
        this.flown = { session, game, events: events.length };

        if (this.liveSession === session && previous?.session === session && previous.game === game) {
            untracked(() => this.launch(events.slice(previous.events).flatMap((event: Readonly<FixedRouletteEvent>) => this.flightsOf(event, events))));
        }
    });

    // The match declares the conversation of its players in the ones of the room, as each message applies
    private readonly declaring = effect(() => {
        const conversations: PrivateConversations = this.conversations();
        const declared: ReadonlyArray<Readonly<PrivateConversation>> = this.session().conversations();
        untracked(() => conversations.declare(declared));
    });

    public ngOnDestroy(): void {
        this.session().destroy();
        this.conversations().destroy();
    }

    protected start(): void {
        void submit(this.setupForm, { action: () => Promise.resolve(this.session().start({ betTime: Number(this.setupModel().betTime) })) });
    }

    /** The croupier places the ball and bets */
    protected place(): void {
        void submit(this.placeForm, { action: () => this.session().place(Number(this.placeModel().pocket), this.betsOf(this.placeModel().chips)) });
    }

    /** The punter bets */
    protected bet(): void {
        void submit(this.betForm, { action: () => Promise.resolve(this.session().bet(this.betsOf(this.betModel().chips))) });
    }

    protected rematch(): void {
        this.session().rematch();
    }

    protected takeSeat(seat: number): void {
        this.session().takeSeat(seat);
    }

    protected leaveSeat(): void {
        this.session().leaveSeat();
    }

    protected release(seat: number): void {
        this.session().unseat(seat);
    }

    private seatView(seat: number): SeatView {
        const session: FixedRouletteSession = this.session();
        const game: FixedRouletteGameState | null = this.game();
        const name: string | null = session.tableSeats.seats()[seat];
        // A player of the match over may leave its seat: another one taking it is out of the match
        const player: number | null = game !== null && name !== null && session.players()[seat] === name ? seat : null;
        const playingGame: FixedRouletteGameState = game as FixedRouletteGameState;

        return {
            seat,
            name,
            player,
            awaited: name !== null && session.awaited().includes(name),
            side: player === null || playingGame.phase() === FixedRoulettePhase.OVER ? null : sideOf(player, playingGame.croupier()),
            chips: player === null ? null : playingGame.chips()[player],
        };
    }

    private startStatus(): TranslatableText {
        const session: FixedRouletteSession = this.session();
        const seated: number = session.tableSeats.taken().length;

        if (seated < session.rules.seats) {
            return { key: key(marker('table.status.seats', undefined, 'fixed')), params: { count: seated } };
        }
        return session.canStart()
            ? { key: key(marker('table.status.start', undefined, 'fixed')) }
            : { key: key(marker('table.status.waitingStart', undefined, 'fixed')) };
    }

    private phaseStatus(game: FixedRouletteGameState): TranslatableText {
        const session: FixedRouletteSession = this.session();
        const croupier: string | null = session.croupier();
        const punter: string | null = session.punter();

        switch (game.phase()) {
            case FixedRoulettePhase.PLACING:
                if (session.canPlace()) {
                    return { key: key(marker('table.status.place', undefined, 'fixed')) };
                }
                // The ball of the local player sealed, its commitment on its way to the chain
                return session.myBall() === null
                    ? { key: key(marker('table.status.placing', undefined, 'fixed')), params: { name: croupier } }
                    : { key: key(marker('table.status.sealed', undefined, 'fixed')), params: { name: punter } };
            case FixedRoulettePhase.BETTING:
                return session.canBet()
                    ? { key: key(marker('table.status.bet', undefined, 'fixed')), params: { name: croupier } }
                    : { key: key(marker('table.status.betting', undefined, 'fixed')), params: { name: punter } };
            default:
                return { key: key(marker('table.status.revealing', undefined, 'fixed')) };
        }
    }

    /** The fields of a pocket each, empty */
    private emptyChips(): ReadonlyArray<number | null> {
        return Array.from({ length: this.session().rules.pockets }, () => null);
    }

    /** The bets of the fields, an empty field betting no chip */
    private betsOf(chips: ReadonlyArray<number | null>): Bets {
        return chips.map((stake: number | null) => stake ?? 0);
    }

    /** The chips the croupier bet in the game, read once it bet */
    private croupierTotal(): number {
        return totalOf((this.game() as FixedRouletteGameState).bets()[Side.CROUPIER] as Bets);
    }

    /** Why the bets of the form are refused, by the rules every page checks: the local player holds the chips of a player */
    private betsError(side: Side, chips: ReadonlyArray<number | null>): BetsError | undefined {
        const rules: FixedRouletteRules = this.session().rules;
        const held: number = this.session().myChips() as number;
        const croupierTotal: number = side === Side.PUNTER ? this.croupierTotal() : 0;
        const error: BetError | null = betError(rules, side, held, croupierTotal, this.betsOf(chips));

        return error === null ? undefined : {
            kind: error,
            message: BET_ERRORS[error],
            chips: held,
            minimum: punterMinimum(held, croupierTotal),
            pockets: rules.punterPockets,
            name: this.session().croupier(),
        };
    }

    /** The chips a move applied live moves */
    private flightsOf(event: Readonly<FixedRouletteEvent>, events: ReadonlyArray<Readonly<FixedRouletteEvent>>): ReadonlyArray<Readonly<ChipFlight>> {
        switch (event.kind) {
            case FixedRouletteEventKind.PLACED:
                return this.flightsFrom(betTransfers(event.croupier, event.bets), 0);
            case FixedRouletteEventKind.BET:
                return this.flightsFrom(betTransfers(event.punter, event.bets), 0);
            case FixedRouletteEventKind.SETTLED:
                // Once the ball dropped in its pocket
                return this.flightsFrom(settlementTransfers(event), BALL_DROP * 1000);
            default:
                // A game void: its bets back to their owners
                return this.flightsFrom(voidTransfers(this.placedBets(events, event.round), (this.game() as FixedRouletteGameState).croupier()), 0);
        }
    }

    /** The bets of a game, as its moves placed them */
    private placedBets(events: ReadonlyArray<Readonly<FixedRouletteEvent>>, round: number): PlacedBets {
        const placed: Readonly<PlacedEvent> | undefined = events.find((event: Readonly<FixedRouletteEvent>): event is Readonly<PlacedEvent> =>
            event.kind === FixedRouletteEventKind.PLACED && event.round === round);
        const bet: Readonly<BetEvent> | undefined = events.find((event: Readonly<FixedRouletteEvent>): event is Readonly<BetEvent> =>
            event.kind === FixedRouletteEventKind.BET && event.round === round);
        return { [Side.CROUPIER]: placed?.bets ?? null, [Side.PUNTER]: bet?.bets ?? null };
    }

    /** The chips moved, from and to their places on the table: none for a player gone from its seat */
    private flightsFrom(transfers: ReadonlyArray<Readonly<ChipTransfer>>, delay: number): ReadonlyArray<Readonly<ChipFlight>> {
        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        return transfers.flatMap((transfer: Readonly<ChipTransfer>): ReadonlyArray<Readonly<ChipFlight>> => {
            const from: HTMLElement | null = this.placeOf(transfer.from);
            const to: HTMLElement | null = this.placeOf(transfer.to);
            return from === null || to === null
                ? []
                : [{ amount: transfer.amount, from: this.point(from, origin), to: this.point(to, origin), delay }];
        });
    }

    private point(element: HTMLElement, origin: DOMRect): TablePoint {
        return middle(element.getBoundingClientRect(), origin);
    }

    /** Where chips lie on the table: the stack of a player on its seat, none once it left it; its stake on a pocket; the bank */
    private placeOf(place: Readonly<ChipPlace>): HTMLElement | null {
        const top: number = this.topSeat().seat;

        switch (place.kind) {
            case ChipPlaceKind.STACK:
                if (this.session().tableSeats.seats()[place.player] !== this.session().players()[place.player]) {
                    return null;
                }
                return (place.player === top ? this.topSeatView() : this.bottomSeatView()).chipsPlace();
            case ChipPlaceKind.POCKET:
                return this.wheel().stackOf(place.pocket, place.player === top ? StakeRow.TOP : StakeRow.BOTTOM);
            case ChipPlaceKind.BANK:
                return this.bankView().nativeElement;
        }
    }

    /** The chips fly, heard by the sounds of the moves. A hidden page runs no animation */
    private launch(flights: ReadonlyArray<Readonly<ChipFlight>>): void {
        if (this.pageVisibility.visible()) {
            this.chipFlights().launch(flights);
        }
    }
}
