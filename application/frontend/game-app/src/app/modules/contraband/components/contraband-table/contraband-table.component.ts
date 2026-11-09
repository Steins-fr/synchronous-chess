import {
    afterRenderEffect, Component, computed, effect, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, untracked, viewChild, viewChildren,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, max, min, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { clockText, SECONDS_PER_MINUTE, setupTimeOptions, signed } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { ChoiceFieldComponent, ChoiceOption } from '@app/modules/form/choice-field/choice-field.component';
import { NumberFieldComponent } from '@app/modules/form/number-field/number-field.component';
import { ChipFlight, ChipFlightsComponent } from '@app/modules/game-table/components/chip-flights/chip-flights.component';
import { middle, TablePoint } from '@app/modules/game-table/helpers/table-point.helper';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { chipsOf } from '@app/modules/playing-cards/types/chip';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { PrivateConversations } from '@app/modules/private-conversations/classes/private-conversations';
import { PrivatePayloads } from '@app/modules/private-conversations/classes/private-messages';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { map, switchMap } from 'rxjs';
import { ContrabandPayloads } from '../../classes/game-sessions/contraband-messages';
import { ContrabandSession, ContrabandSessionOptions } from '../../classes/game-sessions/contraband-session';
import { PlayedContrabandGame } from '../../classes/game-sessions/played-contraband-game';
import { ContrabandEvent, ContrabandEventKind, ContrabandGameState, ContrabandPhase } from '../../classes/rules/contraband-game-state';
import { CallKind, ContrabandVariant, Team, teamOf, trunkLimit } from '../../classes/rules/contraband-rules';
import { ContrabandResult, ContrabandStanding } from '../../classes/rules/standings';
import { CrossingEvent, eventText, SettledEvent, trunkText } from '../../helpers/contraband-texts.helper';
import { HeardContrabandTable, tableSounds } from '../../helpers/table-sound.helper';
import { ContrabandSeatComponent, CustomsRole } from '../contraband-seat/contraband-seat.component';

/** The options of the session of the table: the rules of the game, lighter ones for the specs */
export const CONTRABAND_SESSION_OPTIONS = new InjectionToken<ContrabandSessionOptions>('CONTRABAND_SESSION_OPTIONS', { factory: (): ContrabandSessionOptions => ({}) });

/** The seconds a page waits again once its claim of a timeout came too early on the time of the chain */
const RETRY_TIME: number = 5;

/** A seat of the table, as it shows */
interface SeatView {
    readonly seat: number;
    readonly name: string | null;
    readonly awaited: boolean;
    readonly absent: boolean;
    readonly role: CustomsRole | null;
    readonly atm: number | null;
    readonly account: number | null;
    readonly balance: TranslatableText | null;
    readonly winning: boolean;
}

/** The seats of a country, as they show */
interface TeamView {
    readonly team: Team;
    /** The money left in the ATMs of its players, none out of a match */
    readonly atms: number | null;
    readonly seats: ReadonlyArray<Readonly<SeatView>>;
}

/** A line of the standings, once the match is over */
interface StandingView {
    readonly name: string;
    readonly team: Team;
    readonly smuggled: number;
    readonly seized: number;
    readonly indemnities: TranslatableText;
    readonly share: number;
    readonly balance: TranslatableText;
}

/** Chips a trunk revealed moved, from and to their places on the table: none for a player gone from its seat */
interface MovedChips {
    readonly amount: number;
    readonly from: TablePoint | null;
    readonly to: TablePoint | null;
}

/** The trunk of the game in progress, the last one once the match is over */
interface TrunkView {
    readonly text: TranslatableText;
    /** The money it held, in chips */
    readonly amount: number;
}

/**
 * The table of the Contraband: the seats of both countries, the country of the local player at the bottom, the customs
 * of the game in progress and its trunk, the last game over, the standings at the end. Before the match, the player
 * starting it picks its variant, the time of the customs and the games. The table holds the private conversations of
 * the room, the match declaring its own
 */
@Component({
    selector: 'app-contraband-table',
    templateUrl: './contraband-table.component.html',
    imports: [
        ChipFlightsComponent, ChipStackComponent, ChoiceFieldComponent, ContrabandSeatComponent, MatButtonModule, NumberFieldComponent, SteadyHeightDirective,
        TranslocoDirective, TranslocoPipe,
    ],
    host: { class: 'block max-w-[1100px] mx-auto px-4' },
})
export class ContrabandTableComponent implements OnDestroy {
    public readonly room = input.required<Room<ContrabandPayloads & PrivatePayloads>>();
    private readonly options: ContrabandSessionOptions = inject(CONTRABAND_SESSION_OPTIONS);
    private readonly soundService: SoundService = inject(SoundService);
    private readonly pageVisibility: PageVisibilityService = inject(PageVisibilityService);

    protected readonly session: Signal<ContrabandSession> = computed((): ContrabandSession => {
        const room: Room<ContrabandPayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new ContrabandSession(room, this.options));
    });
    /** The private conversations of the room, for its life: the page offers them in the panel of the room */
    public readonly conversations: Signal<PrivateConversations> = computed((): PrivateConversations => {
        const room: Room<PrivatePayloads> = this.room();
        return untracked(() => new PrivateConversations(room));
    });
    /** The local player plays the match, not over: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.session().inMatch()));

    protected readonly game: Signal<ContrabandGameState | null> = computed((): ContrabandGameState | null => this.session().game());
    protected readonly variants = ContrabandVariant;

    /** The variant, the time of the customs and the games the local player picks before starting the match */
    private readonly setupModel: WritableSignal<Readonly<{ variant: string; customsTime: string; games: string }>> = linkedSignal({
        source: this.session,
        computation: (session: ContrabandSession) => ({
            variant: ContrabandVariant.CLASSIC, customsTime: String(session.rules.defaultCustomsTime), games: String(session.rules.defaultGames),
        }),
    });
    protected readonly setupForm = form(this.setupModel, { name: 'contraband-setup' });
    protected readonly variantOptions: ReadonlyArray<Readonly<ChoiceOption>> = [
        { value: ContrabandVariant.CLASSIC, label: { key: this.key(marker('table.start.classic', undefined, 'contraband')) } },
        { value: ContrabandVariant.GOLD_RUSH, label: { key: this.key(marker('table.start.goldRush', undefined, 'contraband')) } },
    ];
    protected readonly customsTimes: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        setupTimeOptions(this.session().rules.customsTimes));
    protected readonly gameCounts: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        this.session().rules.gameCounts.map((count: number): ChoiceOption => ({
            value: String(count),
            label: { key: this.key(marker('table.start.gameCount', undefined, 'contraband')), params: { count } },
        })));

    /** The money of the trunk the smuggler types, none for each game: the amount is null while the field is empty */
    private readonly packModel: WritableSignal<Readonly<{ amount: number | null }>> = linkedSignal({ source: () => this.roundKey(), computation: () => ({ amount: 0 }) });
    protected readonly packForm = form(this.packModel, (path) => {
        required(path.amount, { message: this.key(marker('table.pack.required', undefined, 'contraband')) });
        min(path.amount, 0, { message: this.key(marker('table.pack.min', undefined, 'contraband')) });
        max(path.amount, () => this.trunkMax(), { message: this.key(marker('table.pack.max', undefined, 'contraband')) });
        validate(path.amount, ({ value }) => Number.isInteger(value())
            ? undefined
            : { kind: 'integer', message: this.key(marker('table.pack.integer', undefined, 'contraband')) });
    }, { name: 'contraband-trunk' });
    /** The amount the inspector doubts, empty for each game */
    private readonly doubtModel: WritableSignal<Readonly<{ amount: number | null }>> = linkedSignal({ source: () => this.roundKey(), computation: () => ({ amount: null }) });
    protected readonly doubtForm = form(this.doubtModel, (path) => {
        required(path.amount, { message: this.key(marker('table.doubt.required', undefined, 'contraband')) });
        min(path.amount, 1, { message: this.key(marker('table.doubt.min', undefined, 'contraband')) });
        max(path.amount, () => this.session().rules.maxDoubt, { message: this.key(marker('table.doubt.max', undefined, 'contraband')) });
        validate(path.amount, ({ value }) => Number.isInteger(value())
            ? undefined
            : { kind: 'integer', message: this.key(marker('table.doubt.integer', undefined, 'contraband')) });
    }, { name: 'contraband-doubt' });

    /** The most the trunk of the local player holds */
    private readonly trunkMax: Signal<number> = computed((): number => trunkLimit(this.session().rules, this.session().myAtm() as number));
    /** The local player, packing, has no gold bar left */
    protected readonly noGold: Signal<boolean> = computed((): boolean => (this.session().myAtm() as number) < this.session().rules.goldBar);

    /**
     * The seats of each country, the one of the local player at the bottom; for a spectator, the one of the first free seat
     * while the seats are open, else the North
     */
    protected readonly teams: Signal<ReadonlyArray<Readonly<TeamView>>> = computed((): ReadonlyArray<Readonly<TeamView>> => {
        const session: ContrabandSession = this.session();
        const bottom: Team = teamOf(session.tableSeats.bottomSeat(), session.rules.teamSeats);
        return [bottom === Team.NORTH ? Team.SOUTH : Team.NORTH, bottom].map((team: Team) => this.teamView(team));
    });

    /** The game over last, shown until the next customs open */
    private readonly lastCrossing: Signal<Readonly<CrossingEvent> | null> = computed((): Readonly<CrossingEvent> | null => {
        const game: ContrabandGameState | null = this.game();
        const phase: ContrabandPhase | undefined = game?.phase();
        const last: Readonly<CrossingEvent> | undefined = this.crossings().at(-1);
        return last === undefined || phase === ContrabandPhase.CUSTOMS || phase === ContrabandPhase.REVEALING ? null : last;
    });
    protected readonly lastCrossingText: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const last: Readonly<CrossingEvent> | null = this.lastCrossing();
        return last === null ? null : eventText(last, this.session().players());
    });
    /** The games over of the match, packed late or settled */
    private readonly crossings: Signal<ReadonlyArray<Readonly<CrossingEvent>>> = computed((): ReadonlyArray<Readonly<CrossingEvent>> =>
        (this.game()?.events() ?? []).filter((event: Readonly<ContrabandEvent>): event is Readonly<CrossingEvent> =>
            event.kind === ContrabandEventKind.PACK_LATE || event.kind === ContrabandEventKind.SETTLED));
    private readonly settled: Signal<ReadonlyArray<Readonly<SettledEvent>>> = computed((): ReadonlyArray<Readonly<SettledEvent>> =>
        this.crossings().filter((event: Readonly<CrossingEvent>): event is Readonly<SettledEvent> => event.kind === ContrabandEventKind.SETTLED));

    /** The trunk of the game in progress: packed, then sealed until it is revealed; the last one once the match is over */
    protected readonly trunk: Signal<Readonly<TrunkView>> = computed((): Readonly<TrunkView> => {
        const game: ContrabandGameState = this.game() as ContrabandGameState;
        const last: Readonly<CrossingEvent> | undefined = this.crossings().at(-1);

        switch (game.phase()) {
            case ContrabandPhase.PACKING:
                return { text: { key: this.key(marker('table.trunk.packing', undefined, 'contraband')) }, amount: 0 };
            case ContrabandPhase.OVER:
                return last?.kind === ContrabandEventKind.SETTLED
                    ? { text: trunkText(last, game.variant), amount: last.contents ?? 0 }
                    : { text: { key: this.key(marker('table.trunk.none', undefined, 'contraband')) }, amount: 0 };
            default:
                return { text: { key: this.key(marker('table.trunk.sealed', undefined, 'contraband')) }, amount: 0 };
        }
    });

    /** The trunk the local player sealed, until it is revealed */
    protected readonly sealed: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const amount: number | null = this.session().myTrunk();

        if (amount === null) {
            return null;
        }
        if (this.game()?.variant === ContrabandVariant.GOLD_RUSH) {
            return amount > 0 ? { key: this.key(marker('table.sealed.gold', undefined, 'contraband')) } : { key: this.key(marker('table.sealed.iron', undefined, 'contraband')) };
        }
        return { key: this.key(marker('table.sealed.amount', undefined, 'contraband')), params: { amount } };
    });

    /** What the match is at: the game, the variant and the time of the customs */
    protected readonly info: Signal<Readonly<{ crossing: TranslatableText; variant: TranslatableText }> | null> = computed(() => {
        const game: ContrabandGameState | null = this.game();

        if (game === null) {
            return null;
        }
        return {
            crossing: { key: this.key(marker('table.info.crossing', undefined, 'contraband')), params: { number: game.crossing() + 1, games: game.setup.games } },
            variant: {
                key: this.key(marker('table.info.variant', undefined, 'contraband')),
                params: { variant: game.variant, minutes: game.setup.customsTime / SECONDS_PER_MINUTE },
            },
        };
    });

    /** The standings, once the match is over, in the order of the seats */
    protected readonly standings: Signal<ReadonlyArray<Readonly<StandingView>>> = computed((): ReadonlyArray<Readonly<StandingView>> => {
        const result: ContrabandResult | null = this.session().played().result();
        const names: ReadonlyArray<string> = this.session().players();
        return (result?.standings ?? []).map((standing: Readonly<ContrabandStanding>): StandingView => ({
            name: names[standing.player],
            team: standing.team,
            smuggled: standing.smuggled,
            seized: standing.seized,
            indemnities: { key: this.key(marker('table.standings.signed', undefined, 'contraband')), params: signed(standing.indemnities) },
            share: standing.share,
            balance: { key: this.key(marker('table.standings.signed', undefined, 'contraband')), params: signed(standing.balance) },
        }));
    });
    /** The country winning, once the match is over */
    protected readonly winners: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const result: ContrabandResult | null = this.session().played().result();
        return result === null ? null : this.resultText(result);
    });

    /** A seated player starts a new match once the former one is over */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: ContrabandSession = this.session();
        return session.over() && session.tableSeats.mySeat() !== null && !session.sending();
    });

    /** The local player is a player the game waits for */
    private readonly myTurn: Signal<boolean> = computed((): boolean => this.session().canPack() || this.session().canCall());
    private readonly roundKey: Signal<string> = computed((): string => {
        const played: PlayedContrabandGame = this.session().played();
        return `${ played.index }:${ played.attempt }:${ this.session().step() }`;
    });
    // A claim voided as too early: the page claims again once the time it was early by is over
    private readonly voidedAt: Signal<number> = linkedSignal({ source: this.roundKey, computation: () => untracked(() => this.session().voidedClaims()) });
    private readonly clockKey: Signal<string | null> = computed((): string | null =>
        this.session().awaited().length === 0 ? null : `${ this.roundKey() }:${ this.session().voidedClaims() }`);
    /** A player the game waits for is away */
    private readonly waitingAway: Signal<boolean> = computed((): boolean => this.session().awaitedAway().length > 0);
    /** A player the game waits for is away, giving the phase more time, once */
    private readonly extendedAway: Signal<boolean> = computed((): boolean => this.session().extendingAway().length > 0);
    /** The phase the clock runs for, from its start: a late tick of a phase closed acts on nothing */
    private clocked: string | null = null;
    /** The seconds left to the player the phase waits for */
    protected readonly timeLeft: Signal<number | null> = turnClock({
        running: () => this.clockKey() !== null,
        times: () => {
            this.clocked = this.roundKey();
            return {
                turnTime: this.session().voidedClaims() > this.voidedAt() ? RETRY_TIME : this.session().phaseTime(),
                awayTime: this.session().rules.awayTime,
            };
        },
        away: this.extendedAway,
        timeOut: () => this.timeOut(),
    });
    protected readonly clock: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const left: number | null = this.timeLeft();
        return left === null ? null : clockText(left);
    });
    protected readonly clockLow: Signal<boolean> = computed((): boolean => (this.timeLeft() ?? CLOCK_LOW + 1) <= CLOCK_LOW);

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText> = computed((): TranslatableText => {
        const session: ContrabandSession = this.session();
        const game: ContrabandGameState | null = this.game();

        if (!session.started()) {
            return this.startStatus();
        }
        if (game === null) {
            return { key: this.key(marker('table.status.drawing', undefined, 'contraband')), params: { names: session.awaited().join(', ') } };
        }
        if (session.over()) {
            return { key: this.key(marker('table.status.over', undefined, 'contraband')) };
        }
        if (this.myTurn() && this.clockLow()) {
            return { key: this.key(marker('table.status.hurry', undefined, 'contraband')) };
        }
        // The local player to act reads its own prompt
        if (this.waitingAway() && !this.myTurn()) {
            return { key: this.key(marker('table.status.away', undefined, 'contraband')), params: { names: session.awaitedAway().join(', ') } };
        }
        return this.phaseStatus(game);
    });

    /** The games of the match over, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const names: ReadonlyArray<string> = this.session().players();
        return [...this.crossings()].reverse().map((event: Readonly<CrossingEvent>) => eventText(event, names));
    });

    /** The result of each match over before the one in progress, by its number in the room, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> =>
        this.session().pastGames().map((played: Readonly<PlayedContrabandGame>, index: number): PastResult => ({
            number: index + 1,
            label: { key: this.key(marker('table.match', undefined, 'contraband')), params: { number: index + 1 } },
            text: this.resultText(played.result() as ContrabandResult),
            verification: null,
        })).reverse());

    /** The session caught up with the history of the room: the table hears the changes from there, and flies their chips */
    private liveSession: ContrabandSession | null = null;
    private heard: Readonly<{ session: ContrabandSession; game: ContrabandGameState | null; table: Readonly<HeardContrabandTable> }> | null = null;
    private flown: Readonly<{ session: ContrabandSession; game: ContrabandGameState | null; settled: number }> | null = null;
    private readonly heardTable: Signal<Readonly<HeardContrabandTable>> = computed((): Readonly<HeardContrabandTable> => {
        const session: ContrabandSession = this.session();
        return {
            seatsTaken: session.tableSeats.seatsTaken(),
            events: this.game()?.events().map((event: Readonly<ContrabandEvent>) => event.kind) ?? [],
            result: session.played().result(),
        };
    });

    // The places of the chips on the table: the trunk, and the account of each seat
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly seatViews: Signal<ReadonlyArray<ContrabandSeatComponent>> = viewChildren('seatView');
    /** The chips the trunks revealed moved, flying over the table */
    private readonly chipFlights: Signal<ChipFlightsComponent> = viewChild.required('chipFlights');

    // A session catches up with the history of the room before its first live message: the table hears the changes from there
    private readonly catchingUp = toObservable(this.session).pipe(
        switchMap((session: ContrabandSession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: ContrabandSession) => {
        this.liveSession = session;
        this.heard = { session, game: session.game(), table: this.heardTable() };
        this.flown = { session, game: session.game(), settled: this.settled().length };
    });

    // A change of the table plays its sounds on every page, a hidden one included: a new match starts from an empty one
    private readonly sounds = effect(() => {
        const session: ContrabandSession = this.session();
        const game: ContrabandGameState | null = this.game();
        const table: Readonly<HeardContrabandTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.SEAT_TAKEN, SoundEffect.CHESS_TURN_START, SoundEffect.POKER_CARD_TURN, SoundEffect.CHIPS]);
        }
        if (this.liveSession !== session || previous?.session !== session) {
            return;
        }
        const before: Readonly<HeardContrabandTable> = previous.game === game ? previous.table : { ...previous.table, events: [], result: null };
        untracked(() => tableSounds(before, table, session.myTeam()).forEach((sound: OneShotSoundEffect) => this.soundService.play(sound)));
    });

    // Once the table shows a trunk revealed live, the money it moved flies from the trunk to the accounts, and from the
    // account of the inspector paying an indemnity: the history of the room flies nothing
    private readonly flights = afterRenderEffect(() => {
        const session: ContrabandSession = this.session();
        const game: ContrabandGameState | null = this.game();
        const settled: ReadonlyArray<Readonly<SettledEvent>> = this.settled();
        const previous: typeof this.flown = this.flown;
        this.flown = { session, game, settled: settled.length };

        if (this.liveSession === session && previous?.session === session && previous.game === game) {
            untracked(() => this.launch(settled.slice(previous.settled).flatMap((event: Readonly<SettledEvent>) => this.flightsOf(event))));
        }
    });

    // The match declares its conversations in the ones of the room, as each message applies
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
        void submit(this.setupForm, {
            action: () => {
                const { variant, customsTime, games } = this.setupModel();
                return Promise.resolve(this.session().start({ variant: variant as ContrabandVariant, customsTime: Number(customsTime), games: Number(games) }));
            },
        });
    }

    /** The smuggler packs the money typed, in the classic variant */
    protected pack(): void {
        void submit(this.packForm, { action: () => this.session().pack(this.packModel().amount as number) });
    }

    /** The smuggler packs a gold bar, or an iron bar, in the Gold Rush */
    protected packBar(gold: boolean): void {
        void this.session().pack(gold ? this.session().rules.goldBar : 0);
    }

    protected pass(): void {
        this.session().call({ kind: CallKind.PASS });
    }

    protected check(): void {
        this.session().call({ kind: CallKind.CHECK });
    }

    protected doubt(): void {
        void submit(this.doubtForm, {
            action: () => Promise.resolve(this.session().call({ kind: CallKind.DOUBT, amount: this.doubtModel().amount as number })),
        });
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

    /**
     * The time of the phase is over: a player of the match claims it. A late tick of the clock of a phase closed claims
     * nothing
     */
    private timeOut(): void {
        const session: ContrabandSession = this.session();

        if (this.clocked === this.roundKey() && session.myIndex() !== null && session.awaited().length > 0) {
            session.claimTimeout();
        }
    }

    private teamView(team: Team): TeamView {
        const session: ContrabandSession = this.session();
        const game: ContrabandGameState | null = this.game();
        const first: number = team === Team.NORTH ? 0 : session.rules.teamSeats;
        const seats: ReadonlyArray<Readonly<SeatView>> = session.tableSeats.seats().slice(first, first + session.rules.teamSeats)
            .map((name: string | null, index: number) => this.seatView(first + index, name));
        // The ATMs of the players of the match in the country, wherever they sit once it is over
        const atms: ReadonlyArray<number> | undefined = game?.atms().filter((_, player: number) => teamOf(player, session.north()) === team);
        return { team, atms: atms?.reduce((total: number, atm: number) => total + atm, 0) ?? null, seats };
    }

    private seatView(seat: number, name: string | null): SeatView {
        const session: ContrabandSession = this.session();
        const game: ContrabandGameState | null = this.game();
        const player: number = name === null || game === null ? -1 : session.players().indexOf(name);
        // A player of the match over, seated in the other country for the next one, shows its money in its country only
        const playing: number | null = player === -1 || teamOf(player, session.north()) !== teamOf(seat, session.rules.teamSeats) ? null : player;

        if (playing === null) {
            return { seat, name, awaited: name !== null && session.awaited().includes(name), absent: false, role: null, atm: null, account: null, balance: null, winning: false };
        }
        const playingGame: ContrabandGameState = game as ContrabandGameState;
        const result: ContrabandResult | null = session.played().result();
        const standing: Readonly<ContrabandStanding> | undefined = result?.standings[playing];
        return {
            seat,
            name,
            awaited: session.awaited().includes(name as string),
            absent: playingGame.absent().includes(playing),
            role: this.roleOf(playingGame, playing),
            atm: playingGame.atms()[playing],
            account: playingGame.accounts()[playing],
            balance: standing === undefined ? null : { key: this.key(marker('table.seat.balance', undefined, 'contraband')), params: signed(standing.balance) },
            winning: standing !== undefined && result?.winner === standing.team,
        };
    }

    /** The part of a player in the game in progress, none once the match is over */
    private roleOf(game: ContrabandGameState, player: number): CustomsRole | null {
        if (game.phase() === ContrabandPhase.OVER) {
            return null;
        }
        if (game.smuggler() === player) {
            return CustomsRole.SMUGGLER;
        }
        return game.inspector() === player ? CustomsRole.INSPECTOR : null;
    }

    private startStatus(): TranslatableText {
        const session: ContrabandSession = this.session();
        const north: number = session.north();
        const south: number = session.players().length - north;

        if (north !== south || north < session.rules.minTeam) {
            return { key: this.key(marker('table.status.seats', undefined, 'contraband')), params: { north, south, min: session.rules.minTeam } };
        }
        return session.canStart()
            ? { key: this.key(marker('table.status.start', undefined, 'contraband')) }
            : { key: this.key(marker('table.status.waitingStart', undefined, 'contraband')), params: { count: session.players().length } };
    }

    private phaseStatus(game: ContrabandGameState): TranslatableText {
        const session: ContrabandSession = this.session();
        const smuggler: string = session.smuggler() as string;
        const inspector: string = session.inspector() as string;

        switch (game.phase()) {
            case ContrabandPhase.PACKING:
                if (session.canPack()) {
                    return { key: this.key(marker('table.status.pack', undefined, 'contraband')) };
                }
                return session.myTrunk() === null
                    ? { key: this.key(marker('table.status.packing', undefined, 'contraband')), params: { name: smuggler } }
                    : { key: this.key(marker('table.status.sealing', undefined, 'contraband')) };
            case ContrabandPhase.CUSTOMS:
                return session.canCall()
                    ? { key: this.key(marker('table.status.call', undefined, 'contraband')), params: { variant: game.variant } }
                    : { key: this.key(marker('table.status.customs', undefined, 'contraband')), params: { smuggler, inspector } };
            default:
                return { key: this.key(marker('table.status.revealing', undefined, 'contraband')) };
        }
    }

    /** The country winning, by how much, or a tie */
    private resultText(result: ContrabandResult): TranslatableText {
        return result.winner === null
            ? { key: this.key(marker('table.result.tie', undefined, 'contraband')) }
            : {
                key: this.key(marker('table.result.winner', undefined, 'contraband')),
                params: { team: result.winner, amount: Math.abs(result.totals[Team.NORTH] - result.totals[Team.SOUTH]) },
            };
    }

    /**
     * The chips a trunk revealed moved: the money smuggled from the trunk to the account of the smuggler, seized to the
     * account of the inspector, the indemnity from the account of the inspector to the one of the smuggler. Half a
     * million makes no chip. A player of the last game may leave its seat as the match is over, before the table shows
     * it: its chips have no account to fly to
     */
    private flightsOf(event: Readonly<SettledEvent>): ReadonlyArray<Readonly<MovedChips>> {
        const table: HTMLElement = this.tableView().nativeElement;
        const origin: DOMRect = table.getBoundingClientRect();
        const place = (element: Element | null): TablePoint | null => element === null ? null : middle(element.getBoundingClientRect(), origin);
        // The trunk shows while the match is played
        const trunk: TablePoint | null = place(table.querySelector('#trunk'));
        const smuggler: TablePoint | null = place(this.accountOf(event.smuggler));
        const inspector: TablePoint | null = place(this.accountOf(event.inspector));
        const { smuggled, seized, indemnity } = event.movement;

        return [
            { amount: smuggled, from: trunk, to: smuggler },
            { amount: seized, from: trunk, to: inspector },
            { amount: indemnity, from: inspector, to: smuggler },
        ].filter((moved: Readonly<MovedChips>) => chipsOf(moved.amount).length > 0);
    }

    /** The account of a player of the match, on its seat: none once it left its seat */
    private accountOf(player: number): HTMLElement | null {
        const seat: number | null = this.session().tableSeats.seatOf(this.session().players()[player]);
        return this.seatViews().find((view: ContrabandSeatComponent) => view.seat() === seat)?.accountPlace() ?? null;
    }

    /**
     * The chips fly, heard as they start, but those of a player gone from its seat. A hidden page runs no animation: it
     * hears the chips moved, at once
     */
    private launch(moved: ReadonlyArray<Readonly<MovedChips>>): void {
        if (moved.length === 0) {
            return;
        }
        if (this.pageVisibility.visible()) {
            this.chipFlights().launch(moved.filter((chips: Readonly<MovedChips>): chips is ChipFlight => chips.from !== null && chips.to !== null));
        }
        this.soundService.play(SoundEffect.CHIPS);
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.CONTRABAND, key);
    }
}
