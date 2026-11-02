import { Component, computed, effect, inject, InjectionToken, input, linkedSignal, OnDestroy, Signal, untracked, WritableSignal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, max, min, required, submit, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { CLOCK_LOW, turnClock } from '@app/helpers/turn-clock.helper';
import { NumberFieldComponent } from '@app/modules/form/number-field/number-field.component';
import { CardHandComponent, HandCard } from '@app/modules/playing-cards/components/card-hand/card-hand.component';
import { SuitedCard } from '@app/modules/playing-cards/types/playing-card';
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
import { BidPokerPayloads } from '../../classes/game-sessions/bid-poker-messages';
import { BidPokerSession, BidPokerSessionOptions } from '../../classes/game-sessions/bid-poker-session';
import { PlayedBidGame } from '../../classes/game-sessions/played-bid-game';
import { BidEvent, BidEventKind, BidPokerGame, BidPokerPhase, Lot } from '../../classes/rules/bid-poker-game';
import { lotLetter } from '../../classes/rules/catalogue';
import { BidPokerResult, Standing } from '../../classes/rules/standings';
import { eventText } from '../../helpers/bid-texts.helper';
import { HeardBidTable, tableSounds } from '../../helpers/table-sound.helper';
import { BidLotComponent } from '../bid-lot/bid-lot.component';
import { BidSeatComponent } from '../bid-seat/bid-seat.component';

/** The options of the session of the table: the rules of the game, lighter ones for the specs */
export const BID_POKER_SESSION_OPTIONS = new InjectionToken<BidPokerSessionOptions>('BID_POKER_SESSION_OPTIONS', { factory: (): BidPokerSessionOptions => ({}) });

/** The seconds a page waits again once its claim of a timeout came too early on the time of the chain */
const RETRY_TIME: number = 5;
const CARD_ID: string = 'card-';

/** A seat of the table, as it shows */
interface SeatView {
    readonly seat: number;
    readonly name: string | null;
    /** The index of its player in the game, none for a free seat or before the game */
    readonly player: number | null;
    readonly coins: number | null;
    readonly cards: ReadonlyArray<Readonly<HandCard>>;
    readonly awaited: boolean;
    readonly sealed: boolean;
    readonly absent: boolean;
    readonly standing: TranslatableText | null;
    /** Its player won a prize */
    readonly winning: boolean;
    /** The 5 cards of its hand, once the game is over */
    readonly highlighted: ReadonlyArray<string>;
}

/** A lot of the catalogue, as it shows */
interface LotView {
    readonly index: number;
    readonly name: TranslatableText;
    readonly cards: ReadonlyArray<Readonly<HandCard>>;
    readonly seller: TranslatableText;
    readonly outcome: TranslatableText | null;
    readonly current: boolean;
}

/** A line of the standings, once the game is over */
interface StandingView {
    readonly name: string;
    readonly place: TranslatableText;
    readonly hand: TranslatableText;
    readonly balance: TranslatableText;
}

/**
 * The table of the Bid Poker: the catalogue of the lots, the seats with the cards of every player, the auction of the
 * lot, the discards of a change session, and the standings at the end
 */
@Component({
    selector: 'app-bid-table',
    templateUrl: './bid-table.component.html',
    imports: [BidLotComponent, BidSeatComponent, CardHandComponent, MatButtonModule, NumberFieldComponent, SteadyHeightDirective, TranslocoDirective, TranslocoPipe],
    host: { class: 'block max-w-[1100px] mx-auto px-4' },
})
export class BidTableComponent implements OnDestroy {
    public readonly room = input.required<Room<BidPokerPayloads>>();
    private readonly options: BidPokerSessionOptions = inject(BID_POKER_SESSION_OPTIONS);
    private readonly soundService: SoundService = inject(SoundService);

    protected readonly session: Signal<BidPokerSession> = computed((): BidPokerSession => {
        const room: Room<BidPokerPayloads> = this.room();

        // The session state is made of signals, it must not become a dependency: only a new room recreates the session
        return untracked(() => new BidPokerSession(room, this.options));
    });
    /** The local player plays the game: leaving the page asks to confirm */
    private readonly inMatch: Signal<boolean> = inject(MatchLeaveWarning).watch(computed((): boolean => this.session().inMatch()));

    protected readonly game: Signal<BidPokerGame | null> = computed((): BidPokerGame | null => this.session().game());
    /** The lot auctioned */
    protected readonly lot: Signal<Readonly<Lot> | null> = computed((): Readonly<Lot> | null => this.game()?.lot() ?? null);

    /** The seats, from the bottom one of the local player, a spectator seeing the table from the first free seat */
    protected readonly seats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => {
        const session: BidPokerSession = this.session();
        return session.tableSeats.seatOrder().map((seat: number) => this.seatView(seat, session.tableSeats.seats()[seat]));
    });
    /** The other seats, then the one of the local player, below them */
    protected readonly otherSeats: Signal<ReadonlyArray<Readonly<SeatView>>> = computed((): ReadonlyArray<Readonly<SeatView>> => this.seats().slice(1));
    protected readonly bottomSeat: Signal<Readonly<SeatView>> = computed((): Readonly<SeatView> => this.seats()[0]);

    /** The cards the local player picked to discard, in the order of its clicks: none at each change session */
    protected readonly picked: WritableSignal<ReadonlyArray<string>> = linkedSignal({ source: () => this.game()?.session(), computation: () => [] });

    /** The bid the local player types, 0 for each lot */
    private readonly bidModel: WritableSignal<{ amount: number }> = linkedSignal({ source: () => this.roundKey(), computation: () => ({ amount: 0 }) });
    protected readonly bidForm = form(this.bidModel, (path) => {
        required(path.amount, { message: this.key(marker('table.bid.required', undefined, 'bid')) });
        min(path.amount, 0, { message: this.key(marker('table.bid.min', undefined, 'bid')) });
        max(path.amount, () => this.myCoins(), { message: this.key(marker('table.bid.max', undefined, 'bid')) });
        validate(path.amount, ({ value }) => Number.isInteger(value())
            ? undefined
            : { kind: 'integer', message: this.key(marker('table.bid.integer', undefined, 'bid')) });
    }, { name: 'bid' });

    /** The coins of the local player, none for a spectator */
    protected readonly myCoins: Signal<number> = computed((): number => {
        const me: number | null = this.session().myIndex();
        return me === null ? 0 : this.game()?.coins()[me] ?? 0;
    });

    /** A seated player starts a new game once the former one is over */
    protected readonly canRematch: Signal<boolean> = computed((): boolean => {
        const session: BidPokerSession = this.session();
        return session.over() && session.tableSeats.mySeat() !== null && !session.sending();
    });

    /** The local player is a player the game waits for */
    private readonly myTurn: Signal<boolean> = computed((): boolean => this.session().canBid() || this.session().canDiscard());
    private readonly roundKey: Signal<string> = computed((): string => {
        const played: PlayedBidGame = this.session().played();
        return `${ played.index }:${ played.attempt }:${ this.session().step() }`;
    });
    // A claim voided as too early: the page claims again once the time it was early by is over
    private readonly voidedAt: Signal<number> = linkedSignal({ source: this.roundKey, computation: () => untracked(() => this.session().voidedClaims()) });
    private readonly clockKey: Signal<string | null> = computed((): string | null =>
        this.session().awaited().length === 0 ? null : `${ this.roundKey() }:${ this.session().voidedClaims() }`);
    /** The players the game waits for who are away */
    private readonly awaitedAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const away: ReadonlyArray<string> = this.session().awayPlayers();
        return this.session().awaited().filter((name: string) => away.includes(name));
    });
    /** A player the game waits for is away: it gets more time, once */
    private readonly waitingAway: Signal<boolean> = computed((): boolean => this.awaitedAway().length > 0);
    /** The round the clock runs for, from its start: a late tick of a phase closed acts on nothing */
    private clocked: string | null = null;
    /** The seconds left to the players the phase waits for */
    protected readonly timeLeft: Signal<number | null> = turnClock({
        running: () => this.clockKey() !== null,
        times: () => {
            this.clocked = this.roundKey();
            return {
                turnTime: this.session().voidedClaims() > this.voidedAt() ? RETRY_TIME : this.session().phaseTime(),
                awayTime: this.session().rules.awayTime,
            };
        },
        away: this.waitingAway,
        timeOut: () => this.timeOut(),
    });
    protected readonly clockLow: number = CLOCK_LOW;

    /** What the table waits for */
    protected readonly status: Signal<TranslatableText> = computed((): TranslatableText => {
        const session: BidPokerSession = this.session();
        const game: BidPokerGame | null = this.game();
        const names: string = session.awaited().join(', ');

        if (!session.started()) {
            return this.startStatus();
        }
        if (game === null) {
            return { key: this.key(marker('table.status.drawing', undefined, 'bid')), params: { names } };
        }
        if (session.over()) {
            return { key: this.key(marker('table.status.over', undefined, 'bid')) };
        }
        const left: number | null = this.timeLeft();
        if (this.myTurn() && left !== null && left <= CLOCK_LOW) {
            return { key: this.key(marker('table.status.hurry', undefined, 'bid')) };
        }
        // The local player to act reads its own prompt
        if (this.waitingAway() && !this.myTurn()) {
            return { key: this.key(marker('table.status.away', undefined, 'bid')), params: { names: this.awaitedAway().join(', ') } };
        }
        return this.phaseStatus(game, names);
    });

    /** The lots of the session in progress, with what became of each: read once the game is drawn only */
    protected readonly lots: Signal<ReadonlyArray<Readonly<LotView>>> = computed((): ReadonlyArray<Readonly<LotView>> => {
        const game: BidPokerGame = this.game() as BidPokerGame;
        const lot: Readonly<Lot> | null = game.lot();
        const outcomes: ReadonlyMap<number, Readonly<BidEvent>> = new Map(game.events()
            .filter((event: Readonly<BidEvent>) => event.session === game.session() && (event.kind === BidEventKind.SOLD || event.kind === BidEventKind.UNSOLD))
            .map((event: Readonly<BidEvent>) => [(event as { lot: number }).lot, event]));
        return game.lots().map((each: Readonly<Lot>): LotView => ({
            index: each.index,
            name: { key: this.key(marker('table.lot.name', undefined, 'bid')), params: { letter: lotLetter(each.index) } },
            cards: this.handCards(each.cards),
            seller: each.seller === null
                ? { key: this.key(marker('table.lot.bank', undefined, 'bid')) }
                : { key: this.key(marker('table.lot.seller', undefined, 'bid')), params: { name: this.session().players()[each.seller] } },
            outcome: this.outcomeText(outcomes.get(each.index)),
            current: each.index === lot?.index,
        }));
    });

    /** The standings, once the game is over */
    protected readonly standings: Signal<ReadonlyArray<Readonly<StandingView>>> = computed((): ReadonlyArray<Readonly<StandingView>> => {
        const result: BidPokerResult | null = this.session().played().result();
        const names: ReadonlyArray<string> = this.session().players();
        return result === null ? [] : result.standings.map((standing: Readonly<Standing>): StandingView => ({
            name: names[standing.player],
            place: this.placeText(standing),
            hand: standing.best === null
                ? { key: this.key(marker('table.result.noHand', undefined, 'bid')) }
                : { key: scopedKey(TranslationScope.CARDS, marker('category', undefined, 'cards')), params: { category: standing.best.value.category } },
            balance: { key: this.key(marker('table.result.balance', undefined, 'bid')), params: { balance: standing.balance } },
        }));
    });

    /** The moves of the game, the latest first */
    public readonly history: Signal<ReadonlyArray<TranslatableText>> = computed((): ReadonlyArray<TranslatableText> => {
        const names: ReadonlyArray<string> = this.session().players();
        return [...this.game()?.events() ?? []].reverse().map((event: Readonly<BidEvent>) => eventText(event, names));
    });

    /** The result of each game over before the one in progress, by its number in the room, the latest first */
    public readonly pastResults: Signal<ReadonlyArray<Readonly<PastResult>>> = computed((): ReadonlyArray<Readonly<PastResult>> =>
        this.session().pastGames().map((played: Readonly<PlayedBidGame>, index: number): PastResult => {
            const result: BidPokerResult = played.result() as BidPokerResult;
            const names = (standings: ReadonlyArray<Readonly<Standing>>): string => standings.map((standing: Readonly<Standing>) => played.players()[standing.player]).join(', ');
            const first: string = names(result.standings.filter((standing: Readonly<Standing>) => standing.place === 1));
            const pigs: string = names(result.standings.filter((standing: Readonly<Standing>) => standing.pig));
            return {
                number: index + 1,
                label: { key: this.key(marker('table.game', undefined, 'bid')), params: { number: index + 1 } },
                // Every player a pig: nobody first
                text: first === ''
                    ? { key: this.key(marker('table.pastAllPigs', undefined, 'bid')), params: { count: result.pigs, pigs } }
                    : { key: this.key(marker('table.past', undefined, 'bid')), params: { first, count: result.pigs, pigs } },
                verification: null,
            };
        }).reverse());

    /** The session caught up with the history of the room: the table hears the changes from there */
    private liveSession: BidPokerSession | null = null;
    private heard: Readonly<{ session: BidPokerSession; game: BidPokerGame | null; table: Readonly<HeardBidTable> }> | null = null;
    private readonly heardTable: Signal<Readonly<HeardBidTable>> = computed((): Readonly<HeardBidTable> => {
        const session: BidPokerSession = this.session();
        return {
            seatsTaken: session.tableSeats.seatsTaken(),
            catalogues: session.catalogues(),
            events: this.game()?.events().map((event: Readonly<BidEvent>) => event.kind) ?? [],
            result: session.played().result(),
        };
    });

    // A session catches up with the history of the room before its first live message: the table hears the changes from there
    private readonly catchingUp = toObservable(this.session).pipe(
        switchMap((session: BidPokerSession) => session.caughtUp.pipe(map(() => session))),
        takeUntilDestroyed(),
    ).subscribe((session: BidPokerSession) => {
        this.liveSession = session;
        this.heard = { session, game: session.game(), table: this.heardTable() };
    });

    // A change of the table plays its sounds on every page, a hidden one included: a new game starts from an empty one
    private readonly sounds = effect(() => {
        const session: BidPokerSession = this.session();
        const game: BidPokerGame | null = this.game();
        const table: Readonly<HeardBidTable> = this.heardTable();
        const previous: typeof this.heard = this.heard;
        this.heard = { session, game, table };
        if (previous?.session !== session) {
            this.soundService.preload([SoundEffect.SEAT_TAKEN, SoundEffect.POKER_SHUFFLE, SoundEffect.CHIPS, SoundEffect.POKER_DEAL]);
        }
        if (this.liveSession !== session || previous?.session !== session) {
            return;
        }
        const before: Readonly<HeardBidTable> = previous.game === game ? previous.table : { ...previous.table, events: [], result: null };
        untracked(() => tableSounds(before, table, session.myIndex()).forEach((sound: OneShotSoundEffect) => this.soundService.play(sound)));
    });

    public ngOnDestroy(): void {
        this.session().destroy();
    }

    protected start(): void {
        this.session().start();
    }

    protected bid(): void {
        void submit(this.bidForm, { action: () => this.session().bid(this.bidModel().amount).then(() => undefined) });
    }

    protected noBid(): void {
        void this.session().bid(0);
    }

    protected discard(): void {
        void this.session().discard(this.picked().map((id: string) => Number(id.slice(CARD_ID.length))));
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
     * The time of the phase is over: a player of the game claims it, the local player included when late, which then acts
     * no more until it bids or discards again. A late tick of the clock of a phase closed claims nothing
     */
    private timeOut(): void {
        const session: BidPokerSession = this.session();

        if (this.clocked === this.roundKey() && session.myIndex() !== null && session.awaited().length > 0) {
            session.claimTimeout();
        }
    }

    private seatView(seat: number, name: string | null): SeatView {
        const session: BidPokerSession = this.session();
        const game: BidPokerGame | null = this.game();
        const player: number | null = name === null ? null : session.players().indexOf(name);
        const playing: number | null = game === null || player === -1 ? null : player;
        const standing: Readonly<Standing> | undefined = playing === null ? undefined : session.played().result()?.standings[playing];

        return {
            seat,
            name,
            player: playing,
            coins: playing === null ? null : (game as BidPokerGame).coins()[playing],
            cards: playing === null ? [] : this.handCards((game as BidPokerGame).holdings()[playing]),
            awaited: name !== null && session.awaited().includes(name),
            sealed: playing !== null && (game as BidPokerGame).committed().includes(playing) && (game as BidPokerGame).awaited().length > 0,
            absent: playing !== null && (game as BidPokerGame).absent().includes(playing),
            standing: standing === undefined ? null : this.placeText(standing),
            winning: (standing?.prize ?? 0) > 0,
            highlighted: standing?.best?.cards.map((card: Readonly<SuitedCard>) => `${ CARD_ID }${ session.rules.deck.indexOf(card) }`) ?? [],
        };
    }

    private handCards(cards: ReadonlyArray<number>): ReadonlyArray<Readonly<HandCard>> {
        return cards.map((id: number): HandCard => ({ id: `${ CARD_ID }${ id }`, card: this.session().rules.deck[id] }));
    }

    private startStatus(): TranslatableText {
        const session: BidPokerSession = this.session();
        const seated: number = session.tableSeats.taken().length;

        if (seated < session.rules.minPlayers) {
            return { key: this.key(marker('table.status.seats', undefined, 'bid')), params: { count: seated, min: session.rules.minPlayers } };
        }
        return session.canStart()
            ? { key: this.key(marker('table.status.start', undefined, 'bid')) }
            : { key: this.key(marker('table.status.waitingStart', undefined, 'bid')), params: { count: seated } };
    }

    private phaseStatus(game: BidPokerGame, names: string): TranslatableText {
        const session: BidPokerSession = this.session();
        const letter: string = lotLetter(game.lotIndex());

        switch (game.phase()) {
            case BidPokerPhase.BIDDING:
                if (session.canBid()) {
                    return { key: this.key(marker('table.status.bid', undefined, 'bid')), params: { letter } };
                }
                return session.myBid() === null
                    ? { key: this.key(marker('table.status.bidding', undefined, 'bid')), params: { letter, names } }
                    : { key: this.key(marker('table.status.sealed', undefined, 'bid')), params: { names } };
            case BidPokerPhase.REVEALING:
                return { key: this.key(marker('table.status.revealing', undefined, 'bid')), params: { letter } };
            case BidPokerPhase.DISCARDING:
                if (session.canDiscard()) {
                    return { key: this.key(marker('table.status.discard', undefined, 'bid')) };
                }
                return session.myDiscards() === null
                    ? { key: this.key(marker('table.status.discarding', undefined, 'bid')), params: { names } }
                    : { key: this.key(marker('table.status.sealed', undefined, 'bid')), params: { names } };
            default:
                return { key: this.key(marker('table.status.disclosing', undefined, 'bid')) };
        }
    }

    private outcomeText(event: Readonly<BidEvent> | undefined): TranslatableText | null {
        if (event?.kind === BidEventKind.SOLD) {
            return { key: this.key(marker('table.lot.sold', undefined, 'bid')), params: { name: this.session().players()[event.winner], price: event.price } };
        }
        if (event?.kind === BidEventKind.UNSOLD) {
            return event.seller === null
                ? { key: this.key(marker('table.lot.out', undefined, 'bid')) }
                : { key: this.key(marker('table.lot.back', undefined, 'bid')) };
        }
        return null;
    }

    private placeText(standing: Readonly<Standing>): TranslatableText {
        return standing.pig
            ? { key: this.key(marker('table.result.pig', undefined, 'bid')) }
            : { key: this.key(marker('table.result.place', undefined, 'bid')), params: { place: standing.place } };
    }

    private key(key: string): string {
        return scopedKey(TranslationScope.BID, key);
    }
}
