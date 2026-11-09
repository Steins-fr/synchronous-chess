import { Component, computed, effect, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, untracked, WritableSignal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { phaseClock, PhaseClock } from '@app/modules/commit-reveal/helpers/phase-clock.helper';
import { setupTimeOf, setupTimeOptions, signed, SignedAmount } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { ChoiceFieldComponent, ChoiceOption } from '@app/modules/form/choice-field/choice-field.component';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { map, switchMap } from 'rxjs';
import { EdenPayloads } from '../../classes/game-sessions/eden-messages';
import { EdenSession, EdenSessionOptions, PlayedEdenGame } from '../../classes/game-sessions/eden-session';
import { CastApple, RoundGain } from '../../classes/rules/apple-count';
import { EdenEvent, EdenEventKind, EdenGameState, EdenPhase } from '../../classes/rules/eden-game-state';
import { Apple } from '../../classes/rules/eden-rules';
import { EdenResult, EdenStanding } from '../../classes/rules/standings';
import { countText, CountedEvent, eventText } from '../../helpers/eden-texts.helper';
import { HeardEdenTable, tableSounds } from '../../helpers/table-sound.helper';
import { EdenAppleComponent } from '../eden-apple/eden-apple.component';
import { EdenSeatComponent } from '../eden-seat/eden-seat.component';

/** The options of the session of the table: the rules of the game, lighter ones for the specs */
export const EDEN_SESSION_OPTIONS = new InjectionToken<EdenSessionOptions>('EDEN_SESSION_OPTIONS', { factory: (): EdenSessionOptions => ({}) });

/** A seat of the table, as it shows */
interface SeatView {
    readonly seat: number;
    readonly name: string | null;
    readonly awaited: boolean;
    readonly sealed: boolean;
    readonly absent: boolean;
    readonly out: boolean;
    /** The apple its player revealed on the round before, shown until the next count */
    readonly apple: Apple | null;
    /** What its player won or lost on the round before */
    readonly gain: Readonly<SignedAmount> | null;
    /** The millions of its player, once the game started */
    readonly balance: Readonly<SignedAmount> | null;
    readonly standing: TranslatableText | null;
    readonly winning: boolean;
}

/** A line of the standings, once the game is over */
interface StandingView {
    readonly name: string;
    readonly place: TranslatableText;
    /** Still in paradise, or the round it lost it */
    readonly detail: TranslatableText;
    readonly balance: TranslatableText;
}

/** A line of what the game is at, by its id */
interface InfoView {
    readonly id: string;
    readonly text: TranslatableText;
}

/**
 * The table of the Garden of Eden: the seats and their balances, the vote in progress, the count of the last round,
 * kept while the next one is voted, the standings at the end. Before the game, the player starting it picks the time of
 * a vote and the starting money
 */
@Component({
    selector: 'app-eden-table',
    templateUrl: './eden-table.component.html',
    imports: [ChoiceFieldComponent, EdenAppleComponent, EdenSeatComponent, MatButtonModule, SteadyHeightDirective, TranslocoDirective, TranslocoPipe],
    host: { class: 'block max-w-[1100px] mx-auto px-4' },
})
export class EdenTableComponent implements OnDestroy {
    public readonly room = input.required<Room<EdenPayloads>>();
    private readonly options: EdenSessionOptions = inject(EDEN_SESSION_OPTIONS);
    private readonly soundService: SoundService = inject(SoundService);

    protected readonly session: Signal<EdenSession> = computed((): EdenSession => {
        const room: Room<EdenPayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new EdenSession(room, this.options));
    });
    /** The local player plays the game, still in paradise: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.session().inMatch()));

    protected readonly game: Signal<EdenGameState | null> = computed((): EdenGameState | null => this.session().game());
    protected readonly apples = Apple;

    /** The time of a vote and the starting money the local player picks before starting the game */
    private readonly setupModel: WritableSignal<Readonly<{ voteTime: string; startMoney: string }>> = linkedSignal({
        source: this.session,
        computation: (session: EdenSession) => ({ voteTime: String(session.rules.defaultVoteTime), startMoney: String(session.rules.defaultStartMoney) }),
    });
    protected readonly setupForm = form(this.setupModel, { name: 'eden-setup' });
    protected readonly voteTimes: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        setupTimeOptions(this.session().rules.voteTimes));
    protected readonly startMoneys: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        this.session().rules.startMoneys.map((amount: number): ChoiceOption =>
            ({ value: String(amount), label: { key: this.key(marker('table.start.money', undefined, 'eden')), params: { amount } } })));

    /** The seats, from the bottom one of the local player, a spectator seeing the table from the first free seat */
    protected readonly seats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => {
        const session: EdenSession = this.session();
        return session.tableSeats.seatOrder().map((seat: number) => this.seatView(seat, session.tableSeats.seats()[seat]));
    });
    /** The other seats, then the one of the local player, below them */
    protected readonly otherSeats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => this.seats().slice(1));
    protected readonly bottomSeat: Signal<Readonly<SeatView>> = computed((): Readonly<SeatView> => this.seats()[0]);

    /** The latest count, kept while the next round is voted: no pause parts two rounds */
    private readonly lastCount: Signal<Readonly<CountedEvent> | null> = computed((): Readonly<CountedEvent> | null =>
        [...this.game()?.events() ?? []].reverse().find((event: Readonly<EdenEvent>): event is Readonly<CountedEvent> => event.kind === EdenEventKind.COUNTED) ?? null);
    protected readonly lastCountText: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const last: Readonly<CountedEvent> | null = this.lastCount();
        return last === null ? null : countText(last, this.session().players(), this.session().rules);
    });

    /** What the game is at: the round and the players still in, the time of a vote and the starting money */
    protected readonly info: Signal<ReadonlyArray<Readonly<InfoView>>> = computed((): ReadonlyArray<Readonly<InfoView>> => {
        const game: EdenGameState | null = this.game();

        if (game === null) {
            return [];
        }
        const rounds: number = this.session().rules.rounds;
        return [
            {
                id: 'round',
                text: { key: this.key(marker('table.info.round', undefined, 'eden')), params: { round: Math.min(game.round() + 1, rounds), rounds, count: game.inPlay().length } },
            },
            {
                id: 'terms',
                text: { key: this.key(marker('table.info.terms', undefined, 'eden')), params: { ...setupTimeOf(game.setup.voteTime), amount: game.setup.startMoney } },
            },
        ];
    });

    /** The standings, once the game is over, by place, the players of a place in the order of the seats */
    protected readonly standings: Signal<ReadonlyArray<Readonly<StandingView>>> = computed((): ReadonlyArray<Readonly<StandingView>> => {
        const result: EdenResult | null = this.session().played().result();
        const names: ReadonlyArray<string> = this.session().players();
        return result === null ? [] : [...result.standings]
            .sort((one: Readonly<EdenStanding>, other: Readonly<EdenStanding>) => one.place - other.place)
            .map((standing: Readonly<EdenStanding>): StandingView => ({
                name: names[standing.player],
                place: this.placeText(standing),
                detail: standing.outAt === null
                    ? { key: this.key(marker('table.result.in', undefined, 'eden')) }
                    : { key: this.key(marker('table.result.out', undefined, 'eden')), params: { round: standing.outAt + 1 } },
                balance: { key: this.key(marker('table.money', undefined, 'eden')), params: signed(standing.balance) },
            }));
    });
    /** The winners, once the game is over */
    protected readonly winners: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const result: EdenResult | null = this.session().played().result();
        if (result === null) {
            return null;
        }
        return result.winners.length === 0
            ? { key: this.key(marker('table.result.noWinner', undefined, 'eden')) }
            : { key: this.key(marker('table.result.winners', undefined, 'eden')), params: { count: result.winners.length, names: this.names(result.winners, this.session().players()) } };
    });

    /** A seated player starts a new game once the former one is over */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: EdenSession = this.session();
        return session.over() && session.tableSeats.mySeat() !== null && !session.sending();
    });

    /** The clock of the phase, for the players it waits for: the page claims its time once over */
    protected readonly clock: PhaseClock = phaseClock(this.session, { extendingAway: (session: EdenSession) => session.extendingAway() });

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText> = computed((): TranslatableText => {
        const session: EdenSession = this.session();
        const game: EdenGameState | null = this.game();
        const names: string = session.awaited().join(', ');

        if (!session.started()) {
            return this.startStatus();
        }
        if (game === null) {
            return { key: this.key(marker('table.status.drawing', undefined, 'eden')), params: { names } };
        }
        if (session.over()) {
            return { key: this.key(marker('table.status.over', undefined, 'eden')) };
        }
        if (session.canVote() && this.clock.low()) {
            return { key: this.key(marker('table.status.hurry', undefined, 'eden')) };
        }
        // The local player to vote reads its own prompt
        if (this.clock.waitingAway() && !session.canVote()) {
            return { key: this.key(marker('table.status.away', undefined, 'eden')), params: { names: session.awaitedAway().join(', ') } };
        }
        if (game.phase() === EdenPhase.REVEALING) {
            return { key: this.key(marker('table.status.revealing', undefined, 'eden')) };
        }
        if (session.canVote()) {
            return { key: this.key(marker('table.status.vote', undefined, 'eden')) };
        }
        return session.myApple() === null
            ? { key: this.key(marker('table.status.voting', undefined, 'eden')), params: { names } }
            : this.sealedStatus();
    });

    /** The moves of the game, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const game: EdenGameState | null = this.game();
        const names: ReadonlyArray<string> = this.session().players();
        return game === null ? [] : [...game.events()].reverse().map((event: Readonly<EdenEvent>) => eventText(event, names, this.session().rules));
    });

    /** The result of each game over before the one in progress, by its number in the room, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> =>
        this.session().pastGames().map((played: Readonly<PlayedEdenGame>, index: number): PastResult => {
            const result: EdenResult = played.result() as EdenResult;
            return {
                number: index + 1,
                label: { key: this.key(marker('table.game', undefined, 'eden')), params: { number: index + 1 } },
                text: result.winners.length === 0
                    ? { key: this.key(marker('table.pastNoWinner', undefined, 'eden')) }
                    : {
                        key: this.key(marker('table.past', undefined, 'eden')),
                        params: { count: result.winners.length, winners: this.names(result.winners, played.players()), ...signed(result.standings[result.winners[0]].balance) },
                    },
                verification: null,
            };
        }).reverse());

    /** The session caught up with the history of the room: the table hears the changes from there */
    private liveSession: EdenSession | null = null;
    private heard: Readonly<{ session: EdenSession; game: EdenGameState | null; table: Readonly<HeardEdenTable> }> | null = null;
    private readonly heardTable: Signal<Readonly<HeardEdenTable>> = computed((): Readonly<HeardEdenTable> => {
        const session: EdenSession = this.session();
        return {
            seatsTaken: session.tableSeats.seatsTaken(),
            events: this.game()?.events().map((event: Readonly<EdenEvent>) => event.kind) ?? [],
            lostParadise: session.lostParadise(),
            result: session.played().result(),
        };
    });

    // A session catches up with the history of the room before its first live message: the table hears the changes from there
    private readonly catchingUp = toObservable(this.session).pipe(
        switchMap((session: EdenSession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: EdenSession) => {
        this.liveSession = session;
        this.heard = { session, game: session.game(), table: this.heardTable() };
    });

    // A change of the table plays its sounds on every page, a hidden one included: a new game starts from an empty one
    private readonly sounds = effect(() => {
        const session: EdenSession = this.session();
        const game: EdenGameState | null = this.game();
        const table: Readonly<HeardEdenTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.SEAT_TAKEN, SoundEffect.POKER_CARD_TURN]);
        }
        if (this.liveSession !== session || previous?.session !== session) {
            return;
        }
        const before: Readonly<HeardEdenTable> = previous.game === game ? previous.table : { ...previous.table, events: [], lostParadise: false, result: null };
        untracked(() => tableSounds(before, table, session.myIndex()).forEach((sound: OneShotSoundEffect) => this.soundService.play(sound)));
    });

    public ngOnDestroy(): void {
        this.session().destroy();
    }

    protected start(): void {
        void submit(this.setupForm, {
            action: () => {
                const { voteTime, startMoney } = this.setupModel();
                return Promise.resolve(this.session().start({ voteTime: Number(voteTime), startMoney: Number(startMoney) }));
            },
        });
    }

    protected vote(apple: Apple): void {
        void this.session().vote(apple);
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

    private seatView(seat: number, name: string | null): SeatView {
        const session: EdenSession = this.session();
        const game: EdenGameState | null = this.game();
        const player: number | null = name === null ? null : session.players().indexOf(name);
        const playing: number | null = game === null || player === -1 ? null : player;
        const standing: Readonly<EdenStanding> | undefined = playing === null ? undefined : session.played().result()?.standings[playing];
        const last: Readonly<CountedEvent> | null = this.lastCount();
        const apple: Readonly<CastApple> | undefined = last?.votes.find((cast: Readonly<CastApple>) => cast.player === playing);
        const gain: Readonly<RoundGain> | undefined = last?.gains.find((round: Readonly<RoundGain>) => round.player === playing);
        const playingGame: EdenGameState = game as EdenGameState;

        return {
            seat,
            name,
            awaited: name !== null && session.awaited().includes(name),
            sealed: playing !== null && playingGame.phase() === EdenPhase.VOTING && playingGame.committed().includes(playing),
            absent: playing !== null && playingGame.absent().includes(playing),
            out: playing !== null && playingGame.out().includes(playing),
            apple: apple?.apple ?? null,
            gain: gain === undefined ? null : signed(gain.gain),
            balance: playing === null ? null : signed(playingGame.balances()[playing]),
            standing: standing === undefined ? null : this.placeText(standing),
            winning: standing?.winner === true,
        };
    }

    private startStatus(): TranslatableText {
        const session: EdenSession = this.session();
        const seated: number = session.tableSeats.taken().length;

        if (seated < session.rules.minPlayers) {
            return { key: this.key(marker('table.status.seats', undefined, 'eden')), params: { count: seated, min: session.rules.minPlayers } };
        }
        return session.canStart()
            ? { key: this.key(marker('table.status.start', undefined, 'eden')) }
            : { key: this.key(marker('table.status.waitingStart', undefined, 'eden')), params: { count: seated } };
    }

    /**
     * The apple of the local player sealed: the others it waits for, its own commitment still on its way to the chain not
     * told. Once every other one is sealed, the apples are revealed next
     */
    private sealedStatus(): TranslatableText {
        const others: ReadonlyArray<string> = this.session().awaited().filter((name: string) => name !== this.room().localPlayer.name);
        return others.length === 0
            ? { key: this.key(marker('table.status.revealing', undefined, 'eden')) }
            : { key: this.key(marker('table.status.sealed', undefined, 'eden')), params: { names: others.join(', ') } };
    }

    private placeText(standing: Readonly<EdenStanding>): TranslatableText {
        return standing.winner
            ? { key: this.key(marker('table.result.winner', undefined, 'eden')) }
            : { key: this.key(marker('table.result.place', undefined, 'eden')), params: { place: standing.place } };
    }

    private names(players: ReadonlyArray<number>, names: ReadonlyArray<string>): string {
        return players.map((player: number) => names[player]).join(', ');
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.EDEN, key);
    }
}
