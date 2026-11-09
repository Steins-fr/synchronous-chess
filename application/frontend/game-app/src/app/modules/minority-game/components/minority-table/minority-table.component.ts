import { Component, computed, effect, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, untracked, WritableSignal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { canRematchOf, pastResultsOf, watchMatch } from '@app/modules/commit-reveal/helpers/commit-reveal-table.helper';
import { phaseClock, PhaseClock } from '@app/modules/commit-reveal/helpers/phase-clock.helper';
import { setupTimeOf, setupTimeOptions } from '@app/modules/commit-reveal/helpers/table-texts.helper';
import { ChoiceFieldComponent, ChoiceOption } from '@app/modules/form/choice-field/choice-field.component';
import { noLink } from '@app/modules/form/rules/no-link.rule';
import { requiredText } from '@app/modules/form/rules/required-text.rule';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { ChatPreferencesService } from '@app/services/chat-preferences/chat-preferences.service';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { maskOffensiveWords, OffensiveWords } from '@app/services/offensive-words/offensive-words';
import { OffensiveWordsService } from '@app/services/offensive-words/offensive-words.service';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { map, switchMap } from 'rxjs';
import { MinorityPayloads } from '../../classes/game-sessions/minority-messages';
import { MinoritySession, MinoritySessionOptions } from '../../classes/game-sessions/minority-session';
import { CastVote, MinorityEvent, MinorityEventKind, MinorityGameState, MinorityPhase } from '../../classes/rules/minority-game-state';
import { MinorityVariant, Vote } from '../../classes/rules/minority-rules';
import { QUESTION_MAX_LENGTH } from '../../classes/rules/question';
import { MinorityResult, MinorityStanding } from '../../classes/rules/standings';
import { countText, CountedEvent, eventText, Mask } from '../../helpers/minority-texts.helper';
import { HeardMinorityTable, tableSounds } from '../../helpers/table-sound.helper';
import { MinoritySeatComponent } from '../minority-seat/minority-seat.component';

/** The options of the session of the table: the rules of the game, lighter ones for the specs */
export const MINORITY_SESSION_OPTIONS = new InjectionToken<MinoritySessionOptions>('MINORITY_SESSION_OPTIONS', { factory: (): MinoritySessionOptions => ({}) });

/** A seat of the table, as it shows */
interface SeatView {
    readonly seat: number;
    readonly name: string | null;
    readonly awaited: boolean;
    readonly sealed: boolean;
    readonly absent: boolean;
    readonly asker: boolean;
    readonly eliminated: boolean;
    /** The vote its player revealed on the question before, shown until the next vote opens */
    readonly vote: Vote | null;
    readonly points: number | null;
    readonly standing: TranslatableText | null;
    readonly winning: boolean;
}

/** A line of the standings, once the game is over */
interface StandingView {
    readonly name: string;
    readonly place: TranslatableText;
    /** The points of its player, or the question that eliminated it */
    readonly detail: TranslatableText;
    /** The millions won or lost, in the elimination variant */
    readonly balance: TranslatableText | null;
}

/** A line of what the game is at, by its id */
interface InfoView {
    readonly id: string;
    readonly text: TranslatableText;
}

/** The question in progress, as it shows */
interface QuestionView {
    readonly title: TranslatableText;
    /** Its text, once asked */
    readonly text: string | null;
}

/**
 * The table of the Minority Game: the seats, the question and the vote in progress, the count of the last vote, the
 * standings at the end. Before the game, the player starting it picks its variant and the time of a vote
 */
@Component({
    selector: 'app-minority-table',
    templateUrl: './minority-table.component.html',
    imports: [ChoiceFieldComponent, MatButtonModule, MinoritySeatComponent, SteadyHeightDirective, TextFieldComponent, TranslocoDirective, TranslocoPipe],
    host: { class: 'block max-w-[1100px] mx-auto px-4' },
})
export class MinorityTableComponent implements OnDestroy {
    public readonly room = input.required<Room<MinorityPayloads>>();
    private readonly options: MinoritySessionOptions = inject(MINORITY_SESSION_OPTIONS);
    private readonly soundService: SoundService = inject(SoundService);
    private readonly preferences: ChatPreferencesService = inject(ChatPreferencesService);
    private readonly offensiveWords: OffensiveWordsService = inject(OffensiveWordsService);

    protected readonly session: Signal<MinoritySession> = computed((): MinoritySession => {
        const room: Room<MinorityPayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new MinoritySession(room, this.options));
    });
    /** The local player plays the game, still in: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = watchMatch(this.session);

    protected readonly game: Signal<MinorityGameState | null> = computed((): MinorityGameState | null => this.session().game());
    protected readonly votes = Vote;
    /** The question asked, as the local player reads it: its offensive words masked, while the setting of the chat hides them */
    private readonly mask: Signal<Mask> = computed((): Mask => {
        const words: OffensiveWords | undefined = this.offensiveWords.words();
        return words !== undefined && this.preferences.hideOffensiveWords.on() ? (text: string) => maskOffensiveWords(text, words) : (text: string) => text;
    });

    /** The variant and the time of a vote the local player picks before starting the game */
    private readonly setupModel: WritableSignal<Readonly<{ variant: string; voteTime: string }>> = linkedSignal({
        source: this.session,
        computation: (session: MinoritySession) => ({ variant: MinorityVariant.ELIMINATION, voteTime: String(session.rules.defaultVoteTime) }),
    });
    protected readonly setupForm = form(this.setupModel, { name: 'minority-setup' });
    protected readonly variants: ReadonlyArray<Readonly<ChoiceOption>> = [
        { value: MinorityVariant.ELIMINATION, label: { key: this.key(marker('table.start.elimination', undefined, 'minority')) } },
        { value: MinorityVariant.SCORE, label: { key: this.key(marker('table.start.score', undefined, 'minority')) } },
    ];
    protected readonly voteTimes: Signal<ReadonlyArray<Readonly<ChoiceOption>>> = computed((): ReadonlyArray<Readonly<ChoiceOption>> =>
        setupTimeOptions(this.session().rules.voteTimes));

    /** The question the asker types, empty for each question */
    private readonly questionModel: WritableSignal<Readonly<{ text: string }>> = linkedSignal({ source: () => this.clock.roundKey(), computation: () => ({ text: '' }) });
    /** A question: too long, or holding a link or an e-mail address, it is refused, its error shown */
    protected readonly questionForm = form(this.questionModel, (path) => {
        requiredText(path.text, this.key(marker('table.question.required', undefined, 'minority')));
        // Counted as the session sends it, without its spaces around
        validate(path.text, ({ value }) => (value().trim().length > QUESTION_MAX_LENGTH
            ? { kind: 'maxLength', maxLength: QUESTION_MAX_LENGTH, message: this.key(marker('table.question.tooLong', undefined, 'minority')) }
            : undefined));
        noLink(path.text, this.key(marker('table.question.link', undefined, 'minority')));
    }, { name: 'minority-question' });

    /** The seats, from the bottom one of the local player, a spectator seeing the table from the first free seat */
    protected readonly seats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => {
        const session: MinoritySession = this.session();
        return session.tableSeats.seatOrder().map((seat: number) => this.seatView(seat, session.tableSeats.seats()[seat]));
    });
    /** The other seats, then the one of the local player, below them */
    protected readonly otherSeats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => this.seats().slice(1));
    protected readonly bottomSeat: Signal<Readonly<SeatView>> = computed((): Readonly<SeatView> => this.seats()[0]);

    /** The latest count, shown until the next vote opens */
    private readonly lastCount: Signal<Readonly<CountedEvent> | null> = computed((): Readonly<CountedEvent> | null => {
        const game: MinorityGameState | null = this.game();
        const phase: MinorityPhase | undefined = game?.phase();
        const counts: ReadonlyArray<Readonly<CountedEvent>> = (game?.events() ?? [])
            .filter((event: Readonly<MinorityEvent>): event is Readonly<CountedEvent> => event.kind === MinorityEventKind.COUNTED);
        const last: Readonly<CountedEvent> | undefined = counts.at(-1);
        return last === undefined || phase === MinorityPhase.VOTING || phase === MinorityPhase.REVEALING ? null : last;
    });
    protected readonly lastCountText: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const last: Readonly<CountedEvent> | null = this.lastCount();
        return last === null ? null : countText(last, this.session().players(), (this.game() as MinorityGameState).variant);
    });

    /** The question in progress, the last one once the game is over */
    protected readonly question: Signal<Readonly<QuestionView> | null> = computed((): Readonly<QuestionView> | null => {
        const game: MinorityGameState | null = this.game();
        const asker: string | null = this.session().asker();

        if (game === null || asker === null) {
            return null;
        }
        const params = { round: game.round() + 1, rounds: this.session().rules.rounds, name: asker };
        const question: string | null = game.question();
        return {
            title: game.variant === MinorityVariant.SCORE
                ? { key: this.key(marker('table.question.roundTitle', undefined, 'minority')), params }
                : { key: this.key(marker('table.question.title', undefined, 'minority')), params },
            text: question === null ? null : this.mask()(question),
        };
    });

    /** What the game is at: the question or the round, the players still in, the variant and the time of a vote */
    protected readonly info: Signal<ReadonlyArray<Readonly<InfoView>>> = computed((): ReadonlyArray<Readonly<InfoView>> => {
        const game: MinorityGameState | null = this.game();

        if (game === null) {
            return [];
        }
        const variant: InfoView = {
            id: 'variant',
            text: { key: this.key(marker('table.info.variantTime', undefined, 'minority')), params: { variant: game.variant, ...setupTimeOf(game.setup.voteTime) } },
        };
        if (game.variant === MinorityVariant.SCORE) {
            const round: number = Math.min(game.round() + 1, this.session().rules.rounds);
            return [{ id: 'round', text: { key: this.key(marker('table.info.round', undefined, 'minority')), params: { round, rounds: this.session().rules.rounds } } }, variant];
        }
        return [
            { id: 'round', text: { key: this.key(marker('table.info.question', undefined, 'minority')), params: { round: game.round() + 1, count: game.alive().length } } },
            variant,
            { id: 'stakes', text: { key: this.key(marker('table.info.stakes', undefined, 'minority')), params: { amount: game.players * this.session().rules.stake } } },
        ];
    });

    /** The standings, once the game is over, by place, the players of a place in the order of the seats */
    protected readonly standings: Signal<ReadonlyArray<Readonly<StandingView>>> = computed((): ReadonlyArray<Readonly<StandingView>> => {
        const result: MinorityResult | null = this.session().played().result();
        const names: ReadonlyArray<string> = this.session().players();
        return result === null ? [] : [...result.standings]
            .sort((one: Readonly<MinorityStanding>, other: Readonly<MinorityStanding>) => one.place - other.place)
            .map((standing: Readonly<MinorityStanding>): StandingView => ({
                name: names[standing.player],
                place: this.placeText(standing),
                detail: this.detailText(standing),
                balance: standing.balance === null ? null : { key: this.key(marker('table.result.balance', undefined, 'minority')), params: { balance: standing.balance } },
            }));
    });
    /** The winners, once the game is over */
    protected readonly winners: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const result: MinorityResult | null = this.session().played().result();
        if (result === null) {
            return null;
        }
        return result.winners.length === 0
            ? { key: this.key(marker('table.result.noWinner', undefined, 'minority')) }
            : { key: this.key(marker('table.result.winners', undefined, 'minority')), params: { count: result.winners.length, names: this.names(result.winners, this.session().players()) } };
    });
    /** The elimination variant tells the millions of each player */
    protected readonly withStakes: Signal<boolean> = computed((): boolean => this.game()?.variant === MinorityVariant.ELIMINATION);

    /** A seated player starts a new game once the former one is over */
    protected readonly canRematch: Signal<boolean> = canRematchOf(this.session);

    /** The local player is a player the game waits for */
    private readonly myTurn: Signal<boolean> = computed((): boolean => this.session().canAsk() || this.session().canVote());
    /** The clock of the phase, for the players it waits for: the page claims its time once over */
    protected readonly clock: PhaseClock = phaseClock(this.session, { extendingAway: (session: MinoritySession) => session.extendingAway() });

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText> = computed((): TranslatableText => {
        const session: MinoritySession = this.session();
        const game: MinorityGameState | null = this.game();
        const names: string = session.awaited().join(', ');

        if (!session.started()) {
            return this.startStatus();
        }
        if (game === null) {
            return { key: this.key(marker('table.status.drawing', undefined, 'minority')), params: { names } };
        }
        if (session.over()) {
            return { key: this.key(marker('table.status.over', undefined, 'minority')) };
        }
        if (this.myTurn() && this.clock.low()) {
            return { key: this.key(marker('table.status.hurry', undefined, 'minority')) };
        }
        // The local player to act reads its own prompt
        if (this.clock.waitingAway() && !this.myTurn()) {
            return { key: this.key(marker('table.status.away', undefined, 'minority')), params: { names: this.session().awaitedAway().join(', ') } };
        }
        return this.phaseStatus(game, names);
    });

    /** The moves of the game, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const game: MinorityGameState | null = this.game();
        const names: ReadonlyArray<string> = this.session().players();
        const mask: Mask = this.mask();
        return game === null ? [] : [...game.events()].reverse().map((event: Readonly<MinorityEvent>) => eventText(event, names, game.variant, mask));
    });

    /** The result of each game over before the one in progress, by its number in the room, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = pastResultsOf(this.session, this.key(marker('table.game', undefined, 'minority')),
        (result: MinorityResult, players: ReadonlyArray<string>): TranslatableText => this.pastText(result, this.names(result.winners, players)));

    /** The session caught up with the history of the room: the table hears the changes from there */
    private liveSession: MinoritySession | null = null;
    private heard: Readonly<{ session: MinoritySession; game: MinorityGameState | null; table: Readonly<HeardMinorityTable> }> | null = null;
    private readonly heardTable: Signal<Readonly<HeardMinorityTable>> = computed((): Readonly<HeardMinorityTable> => {
        const session: MinoritySession = this.session();
        return {
            seatsTaken: session.tableSeats.seatsTaken(),
            events: this.game()?.events().map((event: Readonly<MinorityEvent>) => event.kind) ?? [],
            eliminated: session.eliminated(),
            result: session.played().result(),
        };
    });

    // A session catches up with the history of the room before its first live message: the table hears the changes from there
    private readonly catchingUp = toObservable(this.session).pipe(
        switchMap((session: MinoritySession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: MinoritySession) => {
        this.liveSession = session;
        this.heard = { session, game: session.game(), table: this.heardTable() };
    });

    // A change of the table plays its sounds on every page, a hidden one included: a new game starts from an empty one
    private readonly sounds = effect(() => {
        const session: MinoritySession = this.session();
        const game: MinorityGameState | null = this.game();
        const table: Readonly<HeardMinorityTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.SEAT_TAKEN, SoundEffect.CHESS_TURN_START, SoundEffect.POKER_CARD_TURN]);
        }
        if (this.liveSession !== session || previous?.session !== session) {
            return;
        }
        const before: Readonly<HeardMinorityTable> = previous.game === game ? previous.table : { ...previous.table, events: [], eliminated: false, result: null };
        untracked(() => tableSounds(before, table, session.myIndex()).forEach((sound: OneShotSoundEffect) => this.soundService.play(sound)));
    });

    public ngOnDestroy(): void {
        this.session().destroy();
    }

    protected start(): void {
        void submit(this.setupForm, {
            action: () => {
                const { variant, voteTime } = this.setupModel();
                return Promise.resolve(this.session().start({ variant: variant as MinorityVariant, voteTime: Number(voteTime) }));
            },
        });
    }

    /** The question asked, the form is untouched again: the next question of the player shows no error before it types */
    protected ask(): void {
        void submit(this.questionForm, {
            action: () => {
                this.session().ask(this.questionModel().text);
                this.questionForm().reset();
                return Promise.resolve();
            },
        });
    }

    protected vote(vote: Vote): void {
        void this.session().vote(vote);
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
        const session: MinoritySession = this.session();
        const game: MinorityGameState | null = this.game();
        const player: number | null = name === null ? null : session.players().indexOf(name);
        const playing: number | null = game === null || player === -1 ? null : player;
        const standing: Readonly<MinorityStanding> | undefined = playing === null ? undefined : session.played().result()?.standings[playing];
        const vote: Readonly<CastVote> | undefined = this.lastCount()?.votes.find((cast: Readonly<CastVote>) => cast.player === playing);
        const playingGame: MinorityGameState = game as MinorityGameState;

        return {
            seat,
            name,
            awaited: name !== null && session.awaited().includes(name),
            sealed: playing !== null && playingGame.phase() === MinorityPhase.VOTING && playingGame.committed().includes(playing),
            // Out of the game, a player is no longer awaited: its absence tells nothing more
            absent: playing !== null && playingGame.alive().includes(playing) && playingGame.absent().includes(playing),
            asker: playing !== null && playingGame.asker() === playing && playingGame.phase() !== MinorityPhase.OVER,
            eliminated: playing !== null && playingGame.eliminated().includes(playing),
            vote: vote?.vote ?? null,
            points: playing === null || playingGame.variant !== MinorityVariant.SCORE ? null : playingGame.scores()[playing],
            standing: standing === undefined ? null : this.placeText(standing),
            winning: standing?.winner === true,
        };
    }

    private startStatus(): TranslatableText {
        const session: MinoritySession = this.session();
        const seated: number = session.tableSeats.taken().length;

        if (seated < session.rules.minPlayers) {
            return { key: this.key(marker('table.status.seats', undefined, 'minority')), params: { count: seated, min: session.rules.minPlayers } };
        }
        return session.canStart()
            ? { key: this.key(marker('table.status.start', undefined, 'minority')) }
            : { key: this.key(marker('table.status.waitingStart', undefined, 'minority')), params: { count: seated } };
    }

    private phaseStatus(game: MinorityGameState, names: string): TranslatableText {
        const session: MinoritySession = this.session();
        const asker: string | null = session.asker();

        switch (game.phase()) {
            case MinorityPhase.ASKING:
                if (asker === null) {
                    return { key: this.key(marker('table.status.drawingAsker', undefined, 'minority')) };
                }
                return session.canAsk()
                    ? { key: this.key(marker('table.status.ask', undefined, 'minority')) }
                    : { key: this.key(marker('table.status.asking', undefined, 'minority')), params: { name: asker } };
            case MinorityPhase.VOTING:
                if (session.canVote()) {
                    return { key: this.key(marker('table.status.vote', undefined, 'minority')) };
                }
                return session.myVote() === null
                    ? { key: this.key(marker('table.status.voting', undefined, 'minority')), params: { names } }
                    : this.sealedStatus();
            default:
                return { key: this.key(marker('table.status.revealing', undefined, 'minority')) };
        }
    }

    /**
     * The vote of the local player sealed: the others it waits for, its own commitment still on its way to the chain not
     * told. Once every other one is sealed, the votes are revealed next
     */
    private sealedStatus(): TranslatableText {
        const others: ReadonlyArray<string> = this.session().awaited().filter((name: string) => name !== this.room().localPlayer.name);
        return others.length === 0
            ? { key: this.key(marker('table.status.revealing', undefined, 'minority')) }
            : { key: this.key(marker('table.status.sealed', undefined, 'minority')), params: { names: others.join(', ') } };
    }

    private placeText(standing: Readonly<MinorityStanding>): TranslatableText {
        return standing.winner
            ? { key: this.key(marker('table.result.winner', undefined, 'minority')) }
            : { key: this.key(marker('table.result.place', undefined, 'minority')), params: { place: standing.place } };
    }

    private detailText(standing: Readonly<MinorityStanding>): TranslatableText {
        if (standing.points !== null) {
            return { key: this.key(marker('table.result.points', undefined, 'minority')), params: { count: standing.points } };
        }
        return standing.eliminatedAt === null
            ? { key: this.key(marker('table.result.in', undefined, 'minority')) }
            : { key: this.key(marker('table.result.out', undefined, 'minority')), params: { round: standing.eliminatedAt + 1 } };
    }

    private pastText(result: MinorityResult, winners: string): TranslatableText {
        if (result.winners.length === 0) {
            return { key: this.key(marker('table.pastNoWinner', undefined, 'minority')) };
        }
        if (result.variant === MinorityVariant.SCORE) {
            const points: number = result.standings[result.winners[0]].points as number;
            return { key: this.key(marker('table.pastScore', undefined, 'minority')), params: { winners, points } };
        }
        return { key: this.key(marker('table.past', undefined, 'minority')), params: { winners, count: result.winners.length } };
    }

    private names(players: ReadonlyArray<number>, names: ReadonlyArray<string>): string {
        return players.map((player: number) => names[player]).join(', ');
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.MINORITY, key);
    }
}
