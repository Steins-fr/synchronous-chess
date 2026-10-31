import {
    afterNextRender, afterRenderEffect, Component, computed, DestroyRef, effect, ElementRef, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, signal, untracked, viewChild,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { ChipStackComponent } from '@app/modules/playing-cards/components/chip-stack/chip-stack.component';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { SteadyHeightDirective } from '@app/modules/room-layout/steady-height.directive';
import { ChipFlight, ChipFlightsComponent } from '@app/modules/two-seat-table/components/chip-flights/chip-flights.component';
import { middle, TablePoint } from '@app/modules/two-seat-table/helpers/table-point.helper';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { ReducedMotionService } from '@app/services/reduced-motion/reduced-motion.service';
import { TranslationScope } from '@app/services/language/enums/translation-scope.enum';
import { scopedKey } from '@app/services/language/scoped-key';
import { Room } from '@app/services/room-manager/classes/room/room';
import { SoundEffect } from '@app/services/sound/enums/sound-effect.enum';
import { OneShotSoundEffect } from '@app/services/sound/sound-files';
import { SoundService } from '@app/services/sound/sound.service';
import { TranslatableText } from '@app/types/translatable-text.type';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { map, Subscription, switchMap } from 'rxjs';
import { Cylinder, CylinderVerification } from '../../classes/cylinder/cylinder';
import { CylinderPhase } from '../../classes/cylinder/cylinder-state';
import { PlayedGame } from '../../classes/game-sessions/played-game';
import { AwaitedMove, RoulettePayloads, RouletteSessionOptions, RussianRouletteSession } from '../../classes/game-sessions/russian-roulette-session';
import { RouletteAction, RouletteActionKind, RouletteGame, RouletteResult } from '../../classes/rules/roulette-game';
import { otherSeat, RouletteSeat, SeatPair, withSeat } from '../../classes/rules/roulette-seat';
import { RouletteCylinderComponent } from '../roulette-cylinder/roulette-cylinder.component';
import { RevolverFire, RevolverShot, RouletteRevolverComponent } from '../roulette-revolver/roulette-revolver.component';
import { RouletteSeatComponent, SeatShot } from '../roulette-seat/roulette-seat.component';
import { HeardTable, tableSounds } from '../../helpers/table-sound.helper';
import { PastResult } from '@app/modules/room-layout/room-history/past-result';

/** The options of the session of the table: the cipher and the rules of the app, lighter ones for the specs */
export const ROULETTE_SESSION_OPTIONS = new InjectionToken<RouletteSessionOptions>('ROULETTE_SESSION_OPTIONS', { factory: (): RouletteSessionOptions => ({}) });


/** The revolver aims at a player from the cloth, its middle this far from the seat, and this far right of the name, in pixels */
const AIM_GAP: number = 56;
const AIM_SHIFT: number = 136;
/** The revolver revealing a chamber fires in the air, its muzzle up, this high above the cloth */
const SKY_RISE: number = 24;
const DEGREES_PER_RADIAN: number = 180 / Math.PI;
/** The barrel lies above the middle of the revolver, by this part of its width: its line, not the middle, aims at the name */
const BARREL_RISE: number = 0.08;
/** The chips of the table go to the bank once the chips of the 5th pass reached it, in milliseconds */
const BANK_DELAY: number = 500;

/** Where the revolver lies or aims, its turn in degrees */
interface RevolverPlace extends TablePoint {
    readonly angle: number;
}

/** Where the revolver aims without a player: at the sky, to reveal a chamber */
enum RevolverAim {
    SKY = 'sky',
}

/** Where the revolver aims: at a seat, at the sky to reveal a chamber, nowhere while it lies on the cloth */
type RevolverTarget = RouletteSeat | RevolverAim | null;

/** The pass a player just made, stamped on its seat */
interface PassStamp {
    readonly seat: RouletteSeat;
    readonly chips: number;
}

/** A place of the chips out of the seats */
enum TablePlace {
    TABLE = 'table',
    BANK = 'bank',
}

/** A place of the chips: the stack of a seat, the table or the bank */
type ChipPlace = RouletteSeat | TablePlace;

/** What the table shows of the game, the state before a shot until the revolver fired */
interface TableView {
    readonly chips: SeatPair<number>;
    readonly deaths: SeatPair<number>;
    readonly table: number;
    readonly bank: number;
    readonly chambers: ReadonlyArray<number>;
    /** The moves of the game shown */
    readonly moves: number;
}

/** A chamber the revolver fires, the table showing the state before it until the shot is over */
interface Firing {
    readonly action: Readonly<RouletteAction>;
    readonly before: Readonly<TableView>;
}

/** The moves of a game the table played, as it showed them after its latest render */
interface PlayedMoves {
    readonly game: RouletteGame;
    readonly moves: number;
    readonly view: Readonly<TableView>;
}

/** Chips flying, once their delay is over: every flight of the table has one */
type TableFlight = Readonly<Required<ChipFlight>>;

/** What the moves applied since the latest render play on the table */
interface MovePlay {
    readonly flights: ReadonlyArray<TableFlight>;
    readonly stamp: Readonly<PassStamp> | null;
    readonly firing: Readonly<Firing> | null;
}

/** The table of the 24-shot Russian roulette: the seats, the cylinder, the chips of the table, and the moves of the local player */
@Component({
    selector: 'app-roulette-table',
    templateUrl: './roulette-table.component.html',
    styleUrl: './roulette-table.component.scss',
    imports: [ChipFlightsComponent, ChipStackComponent, MatButtonModule, RouletteCylinderComponent, RouletteRevolverComponent, RouletteSeatComponent, SteadyHeightDirective, TranslocoDirective, TranslocoPipe],
    host: { class: 'block max-w-[720px] mx-auto px-4' },
})
export class RouletteTableComponent implements OnDestroy {
    public readonly room = input.required<Room<RoulettePayloads>>();
    private readonly options: RouletteSessionOptions = inject(ROULETTE_SESSION_OPTIONS);

    protected readonly session: Signal<RussianRouletteSession> = computed((): RussianRouletteSession => {
        const room: Room<RoulettePayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new RussianRouletteSession(room, this.options));
    });
    /** The local player plays the match: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.session().inMatch()));

    protected readonly game: Signal<RouletteGame> = computed((): RouletteGame => this.session().game());

    /** The seat at the bottom of the table: the one of the local player, the first one for a spectator */
    protected readonly bottomSeat: Signal<RouletteSeat> = computed((): RouletteSeat => this.session().tableSeats.bottomSeat());
    protected readonly topSeat: Signal<RouletteSeat> = computed((): RouletteSeat => this.session().tableSeats.topSeat());

    /** Whether each seat holds the player of the game: once it is over, another participant may take it */
    private readonly gameSeats: Signal<SeatPair<boolean>> = computed((): SeatPair<boolean> => {
        const seats: SeatPair<string | null> = this.session().seats();
        const players: SeatPair<string | null> = this.session().players();
        return [seats[RouletteSeat.ONE] === players[RouletteSeat.ONE], seats[RouletteSeat.TWO] === players[RouletteSeat.TWO]];
    });

    /** The chips of each seat: a participant taking a seat once the game is over starts the next one with its stack */
    protected readonly chips: Signal<SeatPair<number>> = computed((): SeatPair<number> => {
        const game: RouletteGame = this.game();
        const of = (seat: RouletteSeat): number => this.gameSeats()[seat] ? game.stacks()[seat] : game.rules.stack;
        return [of(RouletteSeat.ONE), of(RouletteSeat.TWO)];
    });

    protected readonly deaths: Signal<SeatPair<number>> = computed((): SeatPair<number> => {
        const of = (seat: RouletteSeat): number => this.gameSeats()[seat] ? this.game().deaths()[seat] : 0;
        return [of(RouletteSeat.ONE), of(RouletteSeat.TWO)];
    });

    /** The bullets not fired yet, the one the revolver fires included */
    protected readonly bulletsLeft: Signal<number> = computed((): number =>
        2 * this.game().rules.bullets - this.view().chambers.reduce((sum: number, bullets: number) => sum + bullets, 0));

    /** The game as it is */
    private readonly liveView: Signal<Readonly<TableView>> = computed((): Readonly<TableView> => ({
        chips: this.chips(),
        deaths: this.deaths(),
        table: this.game().table(),
        bank: this.game().bank(),
        chambers: this.game().chambers(),
        moves: this.game().actions().length,
    }));

    /** The chamber the revolver fires: until the shot is over, the table keeps its result for itself */
    private readonly _firing = signal<Readonly<Firing> | null>(null);
    /** The revolver fired the chamber, after it held in front of the player: the seat and the table tell what it held */
    protected readonly blasted: WritableSignal<boolean> = signal<boolean>(false);
    private readonly _played = signal<Readonly<PlayedMoves> | null>(null);
    /**
     * A shot, or a chamber revealed, in the game the table did not play yet: the moves play once the table is rendered,
     * the render showing them keeps the table as it was, not the result of the shot
     */
    private readonly unplayed: Signal<Readonly<RouletteAction> | null> = computed((): Readonly<RouletteAction> | null => {
        const played: Readonly<PlayedMoves> | null = this._played();
        const game: RouletteGame = this.game();
        return played?.game === game ? game.actions().slice(played.moves).find((action: Readonly<RouletteAction>) => action.kind !== RouletteActionKind.PASS) ?? null : null;
    });
    /** What the table shows: the state before the chamber the revolver fires, until the shot is over */
    protected readonly view: Signal<Readonly<TableView>> = computed((): Readonly<TableView> => {
        const firing: Readonly<Firing> | null = this._firing();
        if (firing !== null) {
            return firing.before;
        }
        return this.unplayed() === null ? this.liveView() : (this._played() as Readonly<PlayedMoves>).view;
    });

    /** The seat the revolver aims at, the sky when it reveals a chamber, null while it lies on the cloth */
    private readonly target: Signal<RevolverTarget> = computed((): RevolverTarget => {
        const action: Readonly<RouletteAction> | undefined = this._firing()?.action ?? this.unplayed() ?? undefined;
        const game: RouletteGame = this.game();

        if (action !== undefined) {
            return action.kind === RouletteActionKind.REVEAL ? RevolverAim.SKY : action.seat;
        }
        return game.revealing() === null ? game.shooting() : RevolverAim.SKY;
    });
    /** How the revolver fires the chamber, once it reached its place: a new shot for each chamber, the same kind or not */
    protected readonly revolverShot: Signal<Readonly<RevolverFire> | null> = computed((): Readonly<RevolverFire> | null => {
        const action: Readonly<RouletteAction> | undefined = this._firing()?.action;
        if (action === undefined) {
            return null;
        }
        return { kind: action.bullets === 0 ? RevolverShot.EMPTY : RevolverShot.BULLET };
    });
    /** The latest game has a winner, which its badge tells: else a draw, or a game stopped */
    protected readonly winning: Signal<boolean> = computed((): boolean => (this.session().played().result()?.winner ?? null) !== null);
    /** A bullet fired: the table shakes */
    protected readonly shaking: Signal<boolean> = computed((): boolean => this.blasted() && this.revolverShot()?.kind === RevolverShot.BULLET);
    protected readonly aiming: Signal<boolean> = computed((): boolean => this.target() !== null);
    private readonly _revolverPlace = signal<Readonly<RevolverPlace> | null>(null);
    /** Where the revolver lies or aims, once the table is rendered */
    protected readonly revolverPlace: Signal<Readonly<RevolverPlace> | null> = this._revolverPlace.asReadonly();

    private readonly _stamp = signal<Readonly<PassStamp> | null>(null);

    /** The chambers the local player picks for its bullets, none for a new cylinder: a new game, or other players */
    protected readonly selected: WritableSignal<ReadonlyArray<number>> = linkedSignal<Cylinder | null, ReadonlyArray<number>>({
        source: () => this.session().cylinder(),
        computation: (): ReadonlyArray<number> => [],
    });
    /** The local player places its bullets */
    protected readonly placing: Signal<boolean> = computed((): boolean => this.session().canLoad());
    /** The bullets the local player loaded, shown until the cylinder is spun, or the game lost on time before */
    protected readonly loaded: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> => {
        const cylinder: Cylinder | null = this.session().cylinder();
        return cylinder !== null && !this.session().over() && [CylinderPhase.KEYS, CylinderPhase.LOADING, CylinderPhase.SPINNING].includes(cylinder.phase())
            ? cylinder.bullets()
            : [];
    });
    /** The players load the cylinder, until it is spun and the first shooter drawn: it shows larger */
    protected readonly loading: Signal<boolean> = computed((): boolean => this.game().first() === null);
    /** The players load and spin the cylinder, until the game is lost on time */
    protected readonly spinning: Signal<boolean> = computed((): boolean => {
        const phase: CylinderPhase | undefined = this.session().cylinder()?.phase();
        return !this.session().over() && (phase === CylinderPhase.LOADING || phase === CylinderPhase.SPINNING);
    });

    /** The player to act waits for the shot of the other one to be over */
    protected readonly canShoot: Signal<boolean> = computed((): boolean => this.session().myTurn() && this._firing() === null && this.unplayed() === null);
    protected readonly canPass: Signal<boolean> = computed((): boolean => this.canShoot() && this.game().canPass(this.session().mySeat() as RouletteSeat));

    /**
     * A seated player starts a new game once the former one is settled, over or stopped by a broken cylinder, and its keys
     * disclosed, both seats taken
     */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: RussianRouletteSession = this.session();
        return session.mySeat() !== null && !session.seats().includes(null) && session.settled() && !session.sending();
    });

    /** The seats the game waits for */
    protected readonly awaitedSeats: Signal<ReadonlyArray<RouletteSeat>> = computed((): ReadonlyArray<RouletteSeat> =>
        this.session().awaited().map((move: Readonly<AwaitedMove>) => move.seat));
    /**
     * The seats the table shows waited for, their ring and their clock: none from the shot until it is over, all eyes on
     * the revolver. The clock runs meanwhile, for a share withheld
     */
    protected readonly shownAwaited: Signal<ReadonlyArray<RouletteSeat>> = computed((): ReadonlyArray<RouletteSeat> =>
        this.aiming() ? [] : this.awaitedSeats());

    /** A seated player is away: the table waits for it, the clock of the move running */
    private readonly waiting: Signal<boolean> = computed((): boolean => this.session().awayPlayers().length > 0);
    /** Each move the game waits for has its time: a new step, or another player awaited, starts the clock again */
    private readonly clockKey: Signal<string | null> = computed((): string | null => {
        const session: RussianRouletteSession = this.session();
        const awaited: ReadonlyArray<RouletteSeat> = this.awaitedSeats();
        return awaited.length === 0 ? null : `${ session.pastGames().length }:${ session.step() }:${ awaited.join(' ') }`;
    });
    // Each move has its time, from when the page sees it: once over, the page of its player plays for it, or the page of
    // the other player ends the game, the player away or its page withholding a step of the cylinder
    /** The seconds left to the players awaited for their move */
    protected readonly timeLeft: Signal<number | null> = turnClock({
        running: () => this.clockKey() !== null,
        times: () => this.game().rules,
        away: this.waiting,
        timeOut: () => this.timeOut(),
    });

    /** The time of a move of the local player runs out: its status tells it, once, for a screen reader too */
    private readonly hurry: Signal<boolean> = computed((): boolean => {
        const left: number | null = this.timeLeft();
        return left !== null && left <= CLOCK_LOW && (this.placing() || this.canShoot());
    });

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const session: RussianRouletteSession = this.session();
        const cylinder: Cylinder | null = session.cylinder();

        if (cylinder === null || (session.seats().includes(null) && !session.over())) {
            return { key: this.key(marker('table.status.seats', undefined, 'roulette')) };
        }
        if (session.broken()) {
            return { key: this.key(marker('table.status.broken', undefined, 'roulette')) };
        }
        const firing: Readonly<Firing> | null = this._firing();
        if (firing !== null) {
            return this.firingStatus(firing.action.kind, firing.before.chambers.length + 1);
        }
        // A shot the table did not play yet: the next chamber fires, the table as it was
        const unplayed: Readonly<RouletteAction> | null = this.unplayed();
        if (unplayed !== null) {
            return this.firingStatus(unplayed.kind, this.view().chambers.length + 1);
        }
        if (session.over()) {
            return session.awaited().length > 0 ? { key: this.key(marker('table.status.disclosing', undefined, 'roulette')) } : null;
        }
        if (session.mySeat() !== null && cylinder.secretsLost()) {
            return { key: this.key(marker('table.status.lost', undefined, 'roulette')) };
        }
        if (this.hurry()) {
            return { key: this.key(marker('table.status.hurry', undefined, 'roulette')) };
        }
        // The local player plays while the other one is away
        if (this.waiting() && !this.placing() && !this.canShoot()) {
            return { key: this.key(marker('table.status.away', undefined, 'roulette')), params: { name: session.awayPlayers().join(', ') } };
        }
        return this.placing() ? { key: this.key(marker('table.status.place', undefined, 'roulette')), params: { count: this.game().rules.bullets } } : this.cylinderStatus(cylinder);
    });

    /** The latest move of the game, on the table */
    protected readonly lastMove: Signal<TranslatableText | null> = computed((): TranslatableText | null => this.shownMoves().at(-1) ?? null);

    /** The moves of the game, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => [...this.shownMoves()].reverse());

    /** The moves of the game the table shows: not the shot the revolver fires */
    private readonly shownMoves: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => this.moves().slice(0, this.view().moves));

    private readonly moves: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const players: SeatPair<string | null> = this.session().players();
        let chamber: number = 0;
        return this.game().actions().map((action: Readonly<RouletteAction>): TranslatableText => {
            const name: string | null = players[action.seat];
            if (action.kind === RouletteActionKind.PASS) {
                return action.draw
                    ? { key: this.key(marker('table.move.draw', undefined, 'roulette')), params: { name, chips: action.chips } }
                    : { key: this.key(marker('table.move.pass', undefined, 'roulette')), params: { name, chips: action.chips } };
            }
            chamber++;
            if (action.kind === RouletteActionKind.REVEAL) {
                return this.revealText(name, chamber, action.bullets as number);
            }
            if (action.bullets === 0) {
                return action.chips === 0
                    ? { key: this.key(marker('table.move.emptyTable', undefined, 'roulette')), params: { name, chamber } }
                    : { key: this.key(marker('table.move.empty', undefined, 'roulette')), params: { name, chamber, chips: action.chips } };
            }
            return action.bullets === 1
                ? { key: this.key(marker('table.move.death', undefined, 'roulette')), params: { name, chamber } }
                : { key: this.key(marker('table.move.deathDouble', undefined, 'roulette')), params: { name, chamber } };
        });
    });

    /** The result of the game, once its last shot is over */
    protected readonly result: Signal<TranslatableText | null> = computed((): TranslatableText | null =>
        this._firing() === null && this.unplayed() === null ? this.resultText(this.session().played()) : null);

    /** The check of the cylinder, with the result of the game */
    protected readonly verification: Signal<TranslatableText | null> = computed((): TranslatableText | null => {
        const played: PlayedGame = this.session().played();
        if (this.result() === null) {
            return null;
        }
        return played.provisional() ? { key: this.key(marker('table.provisional', undefined, 'roulette')) } : this.verificationText(played.verification());
    });

    /** The result of each game over before the one in progress, by its number in the room, then the check of its cylinder, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> => {
        return this.session().pastGames().map((played: Readonly<PlayedGame>, index: number): PastResult => ({
            number: index + 1,
            label: { key: this.key(marker('table.game', undefined, 'roulette')), params: { number: index + 1 } },
            text: this.resultText(played) as TranslatableText,
            verification: this.verificationText(played.verification()),
        })).reverse();
    });

    // The places of the chips and of the revolver on the table
    private readonly tableView: Signal<ElementRef<HTMLElement>> = viewChild.required('tableSection');
    private readonly bankView: Signal<ElementRef<HTMLElement>> = viewChild.required('bankView');
    private readonly tableStackView: Signal<ChipStackComponent> = viewChild.required('tableStack');
    private readonly restView: Signal<ElementRef<HTMLElement>> = viewChild.required('revolverRest');
    private readonly topSeatView: Signal<RouletteSeatComponent> = viewChild.required('topSeatView');
    private readonly bottomSeatView: Signal<RouletteSeatComponent> = viewChild.required('bottomSeatView');
    /** The chips moved by the latest moves, flying over the table */
    private readonly chipFlights: Signal<ChipFlightsComponent> = viewChild.required('chipFlights');

    private readonly pageVisibility: PageVisibilityService = inject(PageVisibilityService);
    private readonly destroyRef: DestroyRef = inject(DestroyRef);

    /**
     * The session caught up with the history of the room, which the table showed and heard at once: the table plays and
     * hears its changes from there
     */
    private liveSession: RussianRouletteSession | null = null;
    /** The moves last shown, with their session, their game, and the table shown */
    private shown: Readonly<{ session: RussianRouletteSession; game: RouletteGame; moves: number; view: Readonly<TableView> }> | null = null;

    // Once the table shows new moves, they play: a pass stamps its seat and its chips fly to the table, the 5th one in a
    // row taking them to the bank; a shot or a chamber revealed fires the revolver. A hidden page, whose animations would
    // wait for it to be shown, hears them at once
    private readonly movePlays = afterRenderEffect({
        earlyRead: (): Readonly<{ game: RouletteGame; moves: number; play: Readonly<MovePlay> | null }> => {
            const session: RussianRouletteSession = this.session();
            const game: RouletteGame = this.game();
            const actions: ReadonlyArray<Readonly<RouletteAction>> = game.actions();
            const view: Readonly<TableView> = this.liveView();
            const previous: typeof this.shown = this.shown;
            this.shown = { session, game, moves: actions.length, view };

            // A new session or a new game starts from its own moves, and the history of the room plays none: the session
            // caught up with it, the moves play from the table it left
            if (this.liveSession !== session || previous?.session !== session || previous.game !== game || actions.length <= previous.moves) {
                return { game, moves: actions.length, play: null };
            }
            return { game, moves: actions.length, play: this.play(actions.slice(previous.moves), previous.moves, previous.view, view) };
        },
        write: (moves: Signal<Readonly<{ game: RouletteGame; moves: number; play: Readonly<MovePlay> | null }>>): void => {
            const { game, moves: count, play } = moves();

            // The phase depends on the moves played only: the signals it writes must not run it again
            untracked(() => {
                if (play !== null) {
                    if (this.pageVisibility.visible()) {
                        this.start(play);
                    } else {
                        this.heardAtOnce(play);
                    }
                }
                this._played.set({ game, moves: count, view: this._firing()?.before ?? this.liveView() });
            });
        },
    });

    private readonly _resized = signal<number>(0);
    // The table changes its size with the window, a move told or the cylinder loaded: the revolver finds its place again
    private readonly resizing = afterNextRender(() => {
        const observer = new ResizeObserver(() => this._resized.update((resizes: number) => resizes + 1));
        observer.observe(this.tableView().nativeElement);
        this.destroyRef.onDestroy(() => observer.disconnect());
    });

    // The revolver lies on the cloth, or aims at the player shooting: its place follows the layout of the table
    private readonly revolverPlacing = afterRenderEffect({
        earlyRead: (): Readonly<RevolverPlace> => {
            this._resized();
            this.loading();
            return this.revolverPoint(this.target());
        },
        write: (place: Signal<Readonly<RevolverPlace>>): void => {
            const next: Readonly<RevolverPlace> = place();
            const current: Readonly<RevolverPlace> | null = untracked(this._revolverPlace);

            if (current?.x !== next.x || current.y !== next.y || current.angle !== next.angle) {
                this._revolverPlace.set(next);
            }
        },
    });

    private readonly soundService = inject(SoundService);
    private readonly reducedMotion: ReducedMotionService = inject(ReducedMotionService);
    /** The table as the page hears it: the changes of its session made live, and what it shows */
    private readonly heardTable: Signal<Readonly<HeardTable>> = computed((): Readonly<HeardTable> => {
        const session: RussianRouletteSession = this.session();
        const target: RevolverTarget = this.target();
        return {
            seatsTaken: session.seatsTaken(),
            loads: session.loads(),
            aim: target === null ? null : `${ target }`,
            result: this._firing() === null && this.unplayed() === null ? this.game().result() : null,
        };
    });
    /** The table the page last heard, with its session and its game */
    private heard: Readonly<{ session: RussianRouletteSession; game: RouletteGame; table: Readonly<HeardTable> }> | null = null;

    // A session catches up with the history of the room before its first live message: the table shows it at once, then
    // plays and hears the changes from there
    private readonly catchingUp: Subscription = toObservable(this.session).pipe(
        switchMap((session: RussianRouletteSession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: RussianRouletteSession) => this.caughtUp(session));

    // A change of the table plays its sounds on every page, a hidden one included. A new session or a new game starts from
    // its own table, and the history of the room plays none: the session caught up with it, the changes play from there
    private readonly sounds = effect(() => {
        const session: RussianRouletteSession = this.session();
        const game: RouletteGame = this.game();
        const table: Readonly<HeardTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        // A new session loads ahead the files of the sounds of the table: their first play is not late
        if (previous?.session !== session) {
            this.soundService.preload([
                SoundEffect.ROULETTE_BULLET, SoundEffect.ROULETTE_SPIN, SoundEffect.ROULETTE_COCK, SoundEffect.ROULETTE_CLICK, SoundEffect.ROULETTE_SHOT, SoundEffect.CHIPS,
            ]);
        }

        if (this.liveSession !== session || previous?.session !== session || previous.game !== game) {
            return;
        }

        untracked(() => tableSounds(previous.table, table, session.mySeat()).forEach((sound: OneShotSoundEffect) => this.soundService.play(sound)));
    });

    // The cylinder turns while the players load and spin it: its clicks loop until it stops
    private readonly spinSound = effect((onCleanup: (cleanup: () => void) => void) => {
        // The audio started by a gesture made while the cylinder turns: its clicks loop from then
        if (this.spinning() && this.soundService.started()) {
            onCleanup(untracked(() => this.soundService.loop(SoundEffect.ROULETTE_SPIN)));
        }
    });

    public ngOnDestroy(): void {
        this.session().destroy();
    }

    /**
     * The session applied the history of the room, its first live message next: the table shows the game it left at once,
     * the moves played and the table heard, whether the page rendered the end of the history or not. The live changes play
     * from there, the ones applied with the history in a single render included
     */
    private caughtUp(session: RussianRouletteSession): void {
        const game: RouletteGame = session.game();
        const moves: number = game.actions().length;
        this.liveSession = session;
        this._played.set({ game, moves, view: this.liveView() });
        this.shown = { session, game, moves, view: this.liveView() };
        this.heard = { session, game, table: this.heardTable() };
    }

    /** The revolver fires, after it held in front of the player: the table tells what the chamber held, heard at once */
    protected blast(): void {
        const shot: Readonly<RevolverFire> | null = this.revolverShot();
        // A shot the table ended already, its time over before the revolver fired on a hidden page, fires no more
        if (shot === null) {
            return;
        }
        this.blasted.set(true);
        this.soundService.play(shot.kind === RevolverShot.BULLET ? SoundEffect.ROULETTE_SHOT : SoundEffect.ROULETTE_CLICK);
    }

    /** The pass the player of a seat just made, stamped on its seat */
    protected stampOf(seat: RouletteSeat): number | null {
        const stamp: Readonly<PassStamp> | null = this._stamp();
        return stamp?.seat === seat ? stamp.chips : null;
    }

    protected stamped(): void {
        this._stamp.set(null);
    }

    /** The chamber the player of a seat fires, once the revolver fired it */
    protected shotOf(seat: RouletteSeat): SeatShot | null {
        const action: Readonly<RouletteAction> | undefined = this._firing()?.action;

        if (!this.blasted() || action?.kind !== RouletteActionKind.SHOT || action.seat !== seat) {
            return null;
        }
        return action.bullets === 0 ? SeatShot.EMPTY : SeatShot.DEATH;
    }

    /**
     * The chips fly, heard as each flight starts, once its delay is over. A hidden page runs no animation: it hears the
     * chips moved once, at once
     */
    private launch(flights: ReadonlyArray<TableFlight>): void {
        if (!this.pageVisibility.visible()) {
            if (flights.length > 0) {
                this.soundService.play(SoundEffect.CHIPS);
            }
            return;
        }
        this.chipFlights().launch(flights);
        // Without motion, the chips all land at once: heard once
        const reduced: boolean = this.reducedMotion.reduced();
        new Set<number>(flights.map((flight: TableFlight) => reduced ? 0 : flight.delay))
            .forEach((delay: number) => this.soundService.play(SoundEffect.CHIPS, delay / 1000));
    }

    /** The moves start playing: their chips fly, a pass is stamped, a shot fires the revolver, ending a shot still firing */
    private start(played: Readonly<MovePlay>): void {
        this.launch(played.flights);
        if (played.stamp !== null) {
            this._stamp.set(played.stamp);
        }
        if (played.firing !== null) {
            if (this._firing() !== null) {
                this.fired();
            }
            this._firing.set(played.firing);
        }
    }

    /**
     * The shot is over: the table shows its result, then the chips it moved fly. The revolver may end a shot the table
     * ended already, the next one replacing it or its time over, before it sees it: nothing more to end
     */
    protected fired(): void {
        const firing: Readonly<Firing> | null = this._firing();
        if (firing === null) {
            return;
        }

        const { action } = firing;
        this._firing.set(null);
        this.blasted.set(false);
        // The table shows the result, as rendered last: a next shot keeps it until the table plays it, a shot applied since
        // not shown. A shot fires once the table rendered and played it
        const rendered: Readonly<TableView> = (this.shown as NonNullable<typeof this.shown>).view;
        this._played.update((played: Readonly<PlayedMoves> | null) => ({ ...played as Readonly<PlayedMoves>, view: rendered }));

        if (action.kind === RouletteActionKind.REVEAL) {
            return;
        }
        // A page hidden since the shot started moves its chips without flights: heard all the same
        this.launch(this.shotFlights(action));
    }

    /** The chips a shot moves: the table to the shooter of an empty chamber, else its death and the table to the other player */
    private shotFlights(action: Readonly<RouletteAction>): ReadonlyArray<TableFlight> {
        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        const flights: Array<TableFlight> = action.bullets === 0
            ? [this.flight(TablePlace.TABLE, action.seat, action.chips, 0, origin)]
            : [this.flight(action.seat, otherSeat(action.seat), this.game().rules.death, 0, origin), this.flight(TablePlace.TABLE, otherSeat(action.seat), action.chips, 0, origin)];
        return flights.filter((flight: TableFlight) => flight.amount > 0);
    }

    /**
     * Moves a hidden page does not play, running no animation: the latest chamber fired, then the chips the moves moved,
     * the ones of a shot included, heard at once
     */
    private heardAtOnce({ flights, firing }: Readonly<MovePlay>): void {
        const fired: Readonly<RouletteAction> | undefined = firing?.action;
        if (fired !== undefined) {
            this.soundService.play(fired.bullets === 0 ? SoundEffect.ROULETTE_CLICK : SoundEffect.ROULETTE_SHOT);
        }
        this.launch(fired?.kind === RouletteActionKind.SHOT ? [...flights, ...this.shotFlights(fired)] : flights);
    }

    /**
     * What new moves play: the chips of a pass fly from its seat to the table, then to the bank on the 5th one in a row;
     * a shot or a chamber revealed fires the revolver, the table showing the state before it until the shot is over
     * @param from the index of the first new move
     * @param before the table shown before the new moves
     * @param now the table with the new moves
     */
    private play(moves: ReadonlyArray<Readonly<RouletteAction>>, from: number, before: Readonly<TableView>, now: Readonly<TableView>): Readonly<MovePlay> {
        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        const flights: Array<TableFlight> = [];
        let stamp: Readonly<PassStamp> | null = null;
        let firing: Readonly<Firing> | null = null;
        // The table after each move: a shot follows the passes played with it
        let shown: Readonly<TableView> = before;

        for (const [index, action] of moves.entries()) {
            if (action.kind === RouletteActionKind.PASS) {
                flights.push(this.flight(action.seat, TablePlace.TABLE, action.chips, 0, origin));
                if (action.draw) {
                    flights.push(this.flight(TablePlace.TABLE, TablePlace.BANK, shown.table + action.chips, BANK_DELAY, origin));
                }
                stamp = { seat: action.seat, chips: action.chips };
                shown = RouletteTableComponent.passed(shown, action, from + index + 1);
            } else {
                // A chamber revealed follows the pass revealing it, its chips moved already
                firing = {
                    action,
                    before: action.kind === RouletteActionKind.SHOT ? shown : { ...now, chambers: now.chambers.slice(0, -1), moves: from + index },
                };
            }
        }
        return { flights, stamp, firing };
    }

    /** The table after a pass: its chips on the table, the 5th in a row taking them to the bank */
    private static passed(shown: Readonly<TableView>, pass: Readonly<RouletteAction>, moves: number): Readonly<TableView> {
        const table: number = shown.table + pass.chips;
        return {
            ...shown,
            chips: withSeat(shown.chips, pass.seat, shown.chips[pass.seat] - pass.chips),
            table: pass.draw ? 0 : table,
            bank: pass.draw ? shown.bank + table : shown.bank,
            moves,
        };
    }

    private flight(from: ChipPlace, to: ChipPlace, amount: number, delay: number, origin: DOMRect): TableFlight {
        return { amount, from: this.chipPoint(from, origin), to: this.chipPoint(to, origin), delay };
    }

    /** The middle of a place of the chips, from the top left corner of the table */
    private chipPoint(place: ChipPlace, origin: DOMRect): TablePoint {
        let element: HTMLElement;
        if (place === TablePlace.TABLE) {
            element = this.tableStackView().element;
        } else if (place === TablePlace.BANK) {
            element = this.bankView().nativeElement;
        } else {
            element = this.seatView(place).chipsPlace();
        }
        return middle(element.getBoundingClientRect(), origin);
    }

    /** Where the revolver lies on the cloth, aims next to the name of the player shooting, or points to the sky */
    private revolverPoint(target: RevolverTarget): Readonly<RevolverPlace> {
        const origin: DOMRect = this.tableView().nativeElement.getBoundingClientRect();
        const rest: TablePoint = middle(this.restView().nativeElement.getBoundingClientRect(), origin);

        if (target === null) {
            return { ...rest, angle: 0 };
        }
        if (target === RevolverAim.SKY) {
            return { x: rest.x, y: rest.y - SKY_RISE, angle: 90 };
        }
        // On the cloth, next to the seat, the muzzle (on the left of the revolver) turned to the name of the player
        const seat: RouletteSeatComponent = this.seatView(target);
        const name: TablePoint = middle(seat.namePlace().getBoundingClientRect(), origin);
        const seatRect: DOMRect = seat.seatPlace().getBoundingClientRect();
        const x: number = name.x + AIM_SHIFT;
        const y: number = target === this.topSeat() ? seatRect.bottom - origin.top + AIM_GAP : seatRect.top - origin.top - AIM_GAP;
        // The middle of the revolver turned to the name, less the turn bringing the line of the barrel on it
        const lever: number = BARREL_RISE * this.restView().nativeElement.offsetWidth;
        const angle: number = Math.atan2(y - name.y, x - name.x) - Math.asin(Math.min(1, lever / Math.hypot(x - name.x, y - name.y)));
        return { x, y, angle: angle * DEGREES_PER_RADIAN };
    }

    private seatView(seat: RouletteSeat): RouletteSeatComponent {
        return seat === this.topSeat() ? this.topSeatView() : this.bottomSeatView();
    }

    protected takeSeat(seat: RouletteSeat): void {
        this.session().takeSeat(seat);
    }

    protected leaveSeat(): void {
        this.session().leaveSeat();
    }

    protected release(seat: RouletteSeat): void {
        if (this.session().tableSeats.canRelease(seat)) {
            this.session().unseat(seat);
        }
    }

    /** A click on a button the page did not hide yet (a second click, the turn over meanwhile) does nothing */
    protected load(): void {
        if (this.placing() && this.selected().length === this.game().rules.bullets) {
            this.session().load(this.selected());
            this.selected.set([]);
        }
    }

    protected shoot(): void {
        if (this.canShoot()) {
            this.session().shoot();
        }
    }

    protected pass(): void {
        if (this.canPass()) {
            this.session().pass();
        }
    }

    protected rematch(): void {
        if (this.canRematch()) {
            this.session().rematch();
        }
    }

    /**
     * The time of the move is over. The local player passes, or shoots when it can not pay; it loads its bullets in the
     * chambers it picked, completed at random. The other player loses the game: away during its move, or its page not
     * making a step of the cylinder; back, its page plays for it. A shot still firing ends first: a hidden page plays no
     * animation, and would wait for it to be shown
     */
    private timeOut(): void {
        if (this._firing() !== null) {
            this.fired();
        }

        const session: RussianRouletteSession = this.session();
        // The local player of the game claims, even once it lost its seat
        const mine: RouletteSeat | null = session.myPlayerSeat();
        const awaited: ReadonlyArray<Readonly<AwaitedMove>> = session.awaited();
        const other: Readonly<AwaitedMove> | undefined = awaited.find((move: Readonly<AwaitedMove>) => move.seat !== mine);

        if (this.placing()) {
            this.selected.set(this.completed(this.selected()));
            this.load();
        } else if (this.canShoot()) {
            if (this.canPass()) {
                this.pass();
            } else {
                this.shoot();
            }
        } else if (mine !== null && !this.awaitedSeats().includes(mine) && other !== undefined
            && (!other.own || session.awayPlayers().includes(session.players()[other.seat] as string))) {
            session.claimTimeout();
        }
    }

    /** The chambers picked, and others at random up to the bullets of the player */
    private completed(picked: ReadonlyArray<number>): ReadonlyArray<number> {
        const { chambers, bullets } = this.game().rules;
        const free: number[] = Array.from({ length: chambers }, (_, index: number) => index).filter((index: number) => !picked.includes(index));
        const chosen: number[] = [...picked];

        while (chosen.length < bullets) {
            chosen.push(free.splice(Number(CryptoHelper.randomBigInt(BigInt(free.length))), 1)[0]);
        }
        return chosen;
    }

    /** What the cylinder waits for, then the player to act */
    private cylinderStatus(cylinder: Cylinder): TranslatableText {
        const session: RussianRouletteSession = this.session();
        const name: string = cylinder.waitingFor().join(', ');
        const game: RouletteGame = this.game();

        switch (cylinder.phase()) {
            case CylinderPhase.KEYS:
                return session.started()
                    ? { key: this.key(marker('table.status.placeOther', undefined, 'roulette')), params: { name } }
                    : { key: this.key(marker('table.status.placing', undefined, 'roulette')) };
            case CylinderPhase.LOADING:
                return { key: this.key(marker('table.status.loading', undefined, 'roulette')), params: { name } };
            case CylinderPhase.SPINNING:
                return { key: this.key(marker('table.status.spinning', undefined, 'roulette')), params: { name } };
            default:
                break;
        }

        const toAct: RouletteSeat | null = game.toAct();
        if (toAct === null) {
            return this.firingStatus(game.revealing() === null ? RouletteActionKind.SHOT : RouletteActionKind.REVEAL, game.chambers().length + 1);
        }
        return this.canShoot()
            ? { key: this.key(marker('table.status.myTurn', undefined, 'roulette')) }
            : { key: this.key(marker('table.status.theirTurn', undefined, 'roulette')), params: { name: session.players()[toAct] } };
    }

    /** A chamber firing: shot by a player, or revealed by the 5th pass in a row */
    private firingStatus(kind: RouletteActionKind, chamber: number): TranslatableText {
        return kind === RouletteActionKind.REVEAL
            ? { key: this.key(marker('table.status.revealing', undefined, 'roulette')), params: { chamber } }
            : { key: this.key(marker('table.status.firing', undefined, 'roulette')), params: { chamber } };
    }

    /** A chamber revealed by the 5th pass in a row, killing no one */
    private revealText(name: string | null, chamber: number, bullets: number): TranslatableText {
        if (bullets === 0) {
            return { key: this.key(marker('table.move.revealEmpty', undefined, 'roulette')), params: { name, chamber } };
        }
        return bullets === 1
            ? { key: this.key(marker('table.move.revealBullet', undefined, 'roulette')), params: { name, chamber } }
            : { key: this.key(marker('table.move.revealDouble', undefined, 'roulette')), params: { name, chamber } };
    }

    /** The result of a game, with the names of its players: a cheat or a key withheld decides it, then the deaths and the chips */
    private resultText(played: Readonly<PlayedGame>): TranslatableText | null {
        const result: RouletteResult | null = played.result();
        const players: SeatPair<string | null> = played.players();

        // A game stopped by its broken cylinder, until its check names the cheater
        if (result === null) {
            return played.broken() ? { key: this.key(marker('table.result.stopped', undefined, 'roulette')) } : null;
        }
        const cheated: boolean = played.cheaters().length > 0;
        if (result.winner === null) {
            return cheated
                ? { key: this.key(marker('table.result.bothCheated', undefined, 'roulette')) }
                : { key: this.key(marker('table.result.draw', undefined, 'roulette')) };
        }

        const [winner, loser] = [players[result.winner], players[otherSeat(result.winner)]];
        if (cheated) {
            return { key: this.key(marker('table.result.cheated', undefined, 'roulette')), params: { winner, loser } };
        }
        // A player lost on time, then its key withheld: its time over tells it
        if (played.withheld() !== null && played.withheld() !== played.game.forfeited()) {
            return { key: this.key(marker('table.result.withheld', undefined, 'roulette')), params: { winner, loser } };
        }
        if (played.game.forfeited() !== null) {
            return { key: this.key(marker('table.result.forfeit', undefined, 'roulette')), params: { winner, loser } };
        }
        return {
            key: this.key(marker('table.result.win', undefined, 'roulette')),
            params: { winner, deaths: result.deaths[result.winner], otherDeaths: result.deaths[otherSeat(result.winner)], chips: result.stacks[result.winner] },
        };
    }

    /** The check of a cylinder once it ended: until then, the result of its game is provisional */
    private verificationText(verification: CylinderVerification): TranslatableText | null {
        switch (verification) {
            case CylinderVerification.FAIR:
                return { key: this.key(marker('table.verification.fair', undefined, 'roulette')) };
            case CylinderVerification.CHEATED:
                return { key: this.key(marker('table.verification.cheated', undefined, 'roulette')) };
            default:
                return null;
        }
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.ROULETTE, key);
    }
}
