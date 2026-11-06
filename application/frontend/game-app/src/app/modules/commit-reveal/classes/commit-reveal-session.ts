import { computed, Signal, signal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { SeatedPlayer, TableSeats } from '@app/modules/game-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage, AppMessagesOf } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Observable, Subject, Subscription } from 'rxjs';
import { Applied } from './applied';
import { CommitRevealPayloads, CommitRevealTypes, DrawMessage, GameRound, RematchMessage, TimeoutMessage } from './commit-reveal-messages';
import { commitmentOf, CommitmentPart } from './commitment';
import { DrawPhase, DrawStep, FairDraw } from './fair-draw';
import { CommitRevealGame, PlayedCommitRevealGame } from './played-commit-reveal-game';
import { SealedCommitments } from './sealed-commitments';
import { SealedStore } from './sealed-store';

/** The rules every game committing then revealing its moves has */
export interface CommitRevealRules {
    /** The seats of the table */
    readonly seats: number;
    /** The seconds of each step of the draw of the seed */
    readonly drawTime: number;
}

/** A game the session plays, once its seed is drawn */
export interface CommitRevealGameState extends CommitRevealGame<unknown> {
    /** The indexes of the players the phase waits for */
    readonly awaited: Signal<ReadonlyArray<number>>;
    /** The moves of the game: a claim of a timeout names it */
    readonly step: Signal<number>;
    /** The seconds of the phase in progress */
    readonly phaseTime: Signal<number>;
    /** A reveal not matching its commitment: the player counts as withheld */
    refuse(player: number): void;
    /** The time of the phase is over: the players it waits for missed it */
    close(): void;
}

/** What a game gives the session it is built on: read by the constructor of the session, before the fields of the game exist */
export interface CommitRevealSessionConfig<Types extends CommitRevealTypes, Payloads, Rules, Played> {
    readonly rules: Rules;
    readonly types: Types;
    /** The types of every message of the game: the shared ones and its own moves */
    readonly messages: ReadonlyArray<keyof Payloads & string>;
    /** What the sealed values are, the kind of their store in the tab: `votes` for the Minority Game */
    readonly sealKind: string;
    /** A game of the room, by its index, or a new attempt of its draw */
    readonly played: (index: number, attempt: number) => Played;
}

/** The steps of the draw before the game: its commitments, then its reveals */
const DRAW_STEPS: number = 2;
/**
 * The seconds a claim of a timeout may come before the end of the time of its phase, on the time of the chain: the
 * clocks of the pages start once they receive the block opening the phase
 */
const CLAIM_SLACK: number = 2;

/**
 * A game in a room whose players commit to their moves then reveal them. The participants take the seats themselves; a
 * seated player starts the game: the seats are final until it is over. The players draw the seed of the game at once,
 * each one committing to a random part then revealing it. Then each player seals its moves: it commits to a value kept
 * in its tab, and its page reveals it once the phase calls for it. No participant, the sequencer included, reads a value
 * before its reveal.
 *
 * A phase closes as soon as every player it waits for acted, else once its time is over: a player claims it, the first
 * claim in the chain counting, and the players it waited for missed it. A claim coming before the time of the phase, on
 * the time of the chain, is void.
 *
 * The messages apply one after the other, in the order of the chain: the game applies each one in `apply()`, calling
 * `onDraw()`, `onTimeout()` and `onRematch()` for the ones the games share. The fields of a class are set once the
 * constructor of its parent returns: everything the session needs to start comes through its config, and it calls the
 * hooks of the game only once built (in a computed, in the queue of the messages or in a method). The hooks are methods,
 * never arrow functions in fields, which would not exist yet.
 *
 * @typeParam Key the round of a sealed value: the question of a vote, the game of a trunk...
 * @typeParam Seal a value the local player committed to, kept in the tab to reveal it
 */
export abstract class CommitRevealSession<
    Types extends CommitRevealTypes,
    Payloads extends CommitRevealPayloads<Types, Draw>,
    Draw extends DrawMessage,
    Rules extends CommitRevealRules,
    Game extends CommitRevealGameState,
    Setup,
    Played extends PlayedCommitRevealGame<Game, Setup, unknown>,
    Key extends string | number,
    Seal,
> {
    public readonly rules: Rules = this.config.rules;

    private readonly _played = signal<Played>(this.config.played(0, 0));
    /** The game in progress, else the latest */
    public readonly played: Signal<Played> = this._played.asReadonly();
    private readonly _pastGames = signal<ReadonlyArray<Readonly<Played>>>([]);
    /** The games over before the one in progress, the first one first */
    public readonly pastGames: Signal<ReadonlyArray<Readonly<Played>>> = this._pastGames.asReadonly();
    /** The game, once its seed is drawn */
    public readonly game: Signal<Game | null> = computed((): Game | null => this._played().game());

    protected readonly _sending = signal<boolean>(false);
    /** A move of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** A player started the game: its players are final until it is over */
    public readonly started: Signal<boolean> = computed((): boolean => this._played().players().length > 0);
    public readonly over: Signal<boolean> = computed((): boolean => this._played().result() !== null);
    /** The seats are open until the game starts, and once it is over */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => !this.started() || this.over());

    public readonly tableSeats = new TableSeats(this.room, {
        count: this.rules.seats,
        types: { seat: this.config.types.seat, unseat: this.config.types.unseat },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The seated players not connected: the seats are the players of the game while it is played */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;
    /** The players of the game, the seated ones in the order of their seats until it starts */
    public readonly players: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => this.started()
        ? this._played().players()
        : this.tableSeats.taken().map((player: Readonly<SeatedPlayer>) => player.name));
    /** The index of the local player among the players, none for a spectator */
    public readonly myIndex: Signal<number | null> = computed((): number | null => this.indexOf(this.room.localPlayer.name));

    /** The players the game waits for: to draw the seed, then to act in each phase */
    public readonly awaited: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const game: Game | null = this.game();
        if (game === null) {
            return this._played().drawWaitingFor();
        }
        return game.awaited().map((player: number) => this.players()[player]);
    });
    /** The players the game waits for who are away */
    public readonly awaitedAway: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const away: ReadonlyArray<string> = this.awayPlayers();
        return this.awaited().filter((name: string) => away.includes(name));
    });
    /** The phases of the game: a claim of a timeout names it, a move closing the phase meanwhile voids it */
    public readonly step: Signal<number> = computed((): number => {
        const game: Game | null = this.game();
        return game === null ? Number(this._played().drawPhase() === DrawPhase.REVEALING) : DRAW_STEPS + game.step();
    });
    /** The seconds of the phase in progress */
    public readonly phaseTime: Signal<number> = computed((): number => this.game()?.phaseTime() ?? this.rules.drawTime);

    /** Whether the local player may start the game: seated, with enough players, none started */
    public readonly canStart: Signal<boolean> = computed((): boolean => !this._sending() && !this.started()
        && this.tableSeats.mySeat() !== null && this.enough());

    /** The values the local player sealed, by round */
    protected readonly _seals = signal<ReadonlyMap<Key, Readonly<Seal>>>(new Map());

    private readonly _voidedClaims = signal<number>(0);
    /** The claims of the local player voided as too early: its clock waits again */
    public readonly voidedClaims: Signal<number> = this._voidedClaims.asReadonly();
    // The session applied a live message: it caught up with the history of the room
    private live: boolean = false;
    private readonly _caughtUp = new Subject<void>();
    /** Emits once, right before the first live message applies: the table shows the history at once */
    public readonly caughtUp: Observable<void> = this._caughtUp.asObservable();

    /** The commitments of the game in progress, by round */
    private commitments = new SealedCommitments<Key>();
    private seals?: SealedStore<Seal>;
    private parts?: SealedStore<string>;
    /** What the local player sent in this page, once: a reveal sent again after a reload is ignored by the others */
    private readonly sent = new Set<string>();
    /** The time of the chain the phase in progress opened at */
    private openedAt: number = 0;
    private readonly subscription: Subscription;
    /** The messages apply one after the other, in the order of the chain: a reveal checks its commitment first */
    private queue: Promise<void> = Promise.resolve();
    private pending: number = 0;

    // The room, as it sends each message the games share
    private readonly drawRoom: Room<Record<Types['draw'], DrawMessage>> = this.room;
    private readonly timeoutRoom: Room<Record<Types['timeout'], TimeoutMessage>> = this.room;
    private readonly rematchRoom: Room<Record<Types['rematch'], RematchMessage>> = this.room;

    protected constructor(protected readonly room: Room<Payloads>, private readonly config: CommitRevealSessionConfig<Types, Payloads, Rules, Played>) {
        this.subscription = merge(...config.messages.map((type: keyof Payloads & string) => room.messenger(type)))
            .subscribe((message: AppMessagesOf<Payloads>) => {
                this.pending++;
                const history: boolean = room.isHistory(message);
                this.queue = this.queue.then(async () => {
                    if (!history && !this.live) {
                        this.live = true;
                        this._caughtUp.next();
                    }
                    const step: string = this.stepKey();
                    // The move of the local player is in the chain: it may act again
                    if (message.from === room.localPlayer.name && message.type !== config.types.seat) {
                        this._sending.set(false);
                    }
                    await logHandlingFailure(message, this.apply(message));
                    if (this.stepKey() !== step) {
                        this.openedAt = room.sequencedAt(message) ?? 0;
                    }
                    // Once the messages received are applied, as a reloaded page catching up: the page acts on the chain
                    if (--this.pending === 0) {
                        await this.act();
                    }
                });
            });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
    }

    public takeSeat(seat: number): void {
        this.tableSeats.takeSeat(seat);
    }

    public leaveSeat(): void {
        this.tableSeats.leaveSeat();
    }

    /** A seated player frees the seat of another one, away */
    public unseat(seat: number): void {
        this._sending.set(true);
        this.tableSeats.unseat(seat);
    }

    /**
     * The time of the phase is over: the players it waits for missed it. The claim names the step of the phase: a claim of
     * a phase closed meanwhile is void
     */
    public claimTimeout(): void {
        this._sending.set(true);
        this.timeoutRoom.transmitMessage(this.config.types.timeout, { ...this.round(), step: this.step() });
    }

    /** A player of the game over starts a new one */
    public rematch(): void {
        this._sending.set(true);
        this.rematchRoom.transmitMessage(this.config.types.rematch, { game: this._pastGames().length + 1 });
    }

    /** Applies a message of the chain: the game calls the handlers of the session for the messages the games share */
    protected abstract apply(message: AppMessagesOf<Payloads>): Promise<void>;

    /** The seated players are enough to start the game */
    protected abstract enough(): boolean;

    /** The setup a start names, undefined when the rules do not offer it: the start is reported */
    protected abstract setupOf(payload: Readonly<Draw>): Readonly<Setup> | undefined;

    /** The game starts with the seated players and its setup: its draw opens */
    protected abstract openPlayed(seated: ReadonlyArray<Readonly<SeatedPlayer>>, setup: Readonly<Setup>, payload: Readonly<Draw>): void;

    /** The game its seed draws, alike on every page: the last part of the draw was revealed in the message */
    protected abstract drawGame(seed: string, message: AppMessage<Types['draw'], Draw>): Promise<Game>;

    /** The round of the values the phase of the game reveals, none out of a reveal */
    protected abstract revealKey(game: Game): Key | null;

    /** The local player reveals a value it sealed */
    protected abstract transmitReveal(game: Game, seal: Readonly<Seal>): void;

    protected round(): GameRound {
        return { game: this._played().index, attempt: this._played().attempt };
    }

    protected isRound(payload: GameRound): boolean {
        return payload.game === this._played().index && payload.attempt === this._played().attempt;
    }

    protected indexOf(name: string): number | null {
        const index: number = this.players().indexOf(name);
        return index === -1 ? null : index;
    }

    /**
     * The local player seals a value: it is kept in the tab before its commitment is sent, a reload reveals it. The game
     * builds the commitment message before the hash, its round included: a timeout applied meanwhile moves to the next one
     *
     * @param commit sends the commitment message
     */
    protected async seal(key: Key, seal: Readonly<Seal>, preimage: ReadonlyArray<CommitmentPart>, commit: (commitment: string) => void): Promise<void> {
        this._sending.set(true);
        this._seals.update((seals: ReadonlyMap<Key, Readonly<Seal>>) => new Map([...seals, [key, seal]]));
        const commitment: string = await commitmentOf(preimage, ':');
        this.sealStore.save(commitment, seal);
        commit(commitment);
    }

    /**
     * A commitment applied to the game: the first one of a player for its round counts, its value restored when the local
     * player sealed it in its tab. A commitment of the local player the game did not take, too late or a second one: its
     * seal is of no use. The one taken, delivered again, keeps its seal
     */
    protected committed(applied: Applied, key: Key, from: string, commitment: string): void {
        if (applied === Applied.APPLIED) {
            this.commitments.record(key, from, commitment);
            this.restore(from, key, commitment);
        } else if (from === this.room.localPlayer.name && this.commitments.get(key, from) !== commitment) {
            this.sealStore.remove(commitment);
        }
    }

    /**
     * Whether a value revealed matches the commitment of its player: else the reveal is reported, and the game refuses
     * it. The value of the local player leaves its tab either way
     *
     * @param preimage the commitment to the value revealed, with the salt revealed
     */
    protected async opened(message: AppMessage, key: Key, salt: unknown, preimage: (salt: string) => ReadonlyArray<CommitmentPart>): Promise<boolean> {
        const matching: boolean = typeof salt === 'string' && this.commitments.get(key, message.from) === await commitmentOf(preimage(salt), ':');

        this.revealed(message.from, key);
        if (!matching) {
            this.room.reportCheat(message, CheatReason.INVALID_REVEAL);
            (this.game() as Game).refuse(this.indexOf(message.from) as number);
        }
        return matching;
    }

    /**
     * A seated player starts the game with the seated players it names, enough, and a setup the rules offer: a start
     * naming others is void, a seat changed meanwhile. Then each player commits to its random part, and reveals it once
     * every one committed: the seed draws the game before the next message applies, alike on every page, a page catching
     * up included
     */
    protected async onDraw(message: AppMessage<Types['draw'], Draw>): Promise<void> {
        const { players, commitment, part } = message.payload;

        if (!this.isRound(message.payload)) {
            return;
        }
        if (players !== undefined) {
            this.open(message, players);
            return;
        }
        if (!this.started() || this.game() !== null) {
            return;
        }

        const played: Played = this._played();
        const draw: FairDraw = played.draw as FairDraw;
        const step: DrawStep = part === undefined ? draw.commit(message.from, commitment) : await draw.reveal(message.from, part);
        if (step === DrawStep.INVALID) {
            this.room.reportCheat(message, part === undefined ? CheatReason.INVALID_MESSAGE : CheatReason.INVALID_REVEAL);
        }
        played.drew();

        const seed: string | undefined = await draw.seed();
        if (seed !== undefined) {
            // Every part is in the chain: a page reloaded draws the seed again from it
            this.partStore.remove(played.drawContext);
            played.start(await this.drawGame(seed, message));
        }
    }

    /**
     * A player of the game tells the time of the phase is over, the first claim in the chain counting: a claim naming a
     * step past, or coming before the time of the phase on the time of the chain, is void. The draw of the seed over, its
     * late players lose their seats and the seats open again, for a new attempt; else they missed the phase
     */
    protected onTimeout(message: AppMessage<Types['timeout'], TimeoutMessage>): void {
        // A room without the time of a chain can not tell a claim too early
        const at: number | undefined = this.room.sequencedAt(message);

        if (this.indexOf(message.from) === null || !this.started() || !this.isRound(message.payload) || message.payload.step !== this.step()
            || this.awaited().length === 0) {
            return;
        }
        if (at !== undefined && at - this.openedAt < (this.phaseTime() - CLAIM_SLACK) * 1000) {
            if (message.from === this.room.localPlayer.name) {
                this._voidedClaims.update((count: number) => count + 1);
            }
            return;
        }

        const game: Game | null = this.game();
        if (game !== null) {
            const key: Key | null = this.revealKey(game);
            if (key !== null) {
                this.revealed(this.room.localPlayer.name, key);
            }
            game.close();
            return;
        }

        // The part of the local player of a draw over: a reload does not need it anymore
        this.partStore.remove(this._played().drawContext);
        this.awaited().forEach((late: string) => this.tableSeats.free(this.tableSeats.seatOf(late) as number));
        this._played.set(this.config.played(this._played().index, this._played().attempt + 1));
    }

    /**
     * A seated player starts a new game once the former one is over, its seats open: the first request starts it, the
     * others name a game started already. The new game has its own setup, commitments and seals
     */
    protected onRematch(from: string, game: number): void {
        if (this.tableSeats.seatOf(from) === null || !this.over() || game !== this._pastGames().length + 1) {
            return;
        }

        this._pastGames.update((games: ReadonlyArray<Readonly<Played>>) => [...games, this._played()]);
        this._played.set(this.config.played(game, 0));
        this.commitments = new SealedCommitments<Key>();
        this._seals.set(new Map());
        // No value of the new game is sealed yet: the seals left of a game over in the history of a page reloaded go
        if (this.live) {
            this.sealStore.clear();
        }
    }

    private get sealStore(): SealedStore<Seal> {
        this.seals ??= new SealedStore<Seal>(this.config.sealKind, this.room.roomName, this.room.localPlayer.name);
        return this.seals;
    }

    private get partStore(): SealedStore<string> {
        this.parts ??= new SealedStore<string>('draws', this.room.roomName, this.room.localPlayer.name);
        return this.parts;
    }

    private stepKey(): string {
        return `${ this._played().index }:${ this._played().attempt }:${ this.started() }:${ this.step() }`;
    }

    /** The game starts with the seated players, the ones the start names: its draw opens, with the salts of the players */
    private open(message: AppMessage<Types['draw'], Draw>, players: unknown): void {
        const seated: ReadonlyArray<Readonly<SeatedPlayer>> = this.tableSeats.taken();
        const names: ReadonlyArray<string> = seated.map((player: Readonly<SeatedPlayer>) => player.name);
        const setup: Readonly<Setup> | undefined = this.setupOf(message.payload);

        if (setup === undefined) {
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            return;
        }
        if (!this.started() && Array.isArray(players) && players.join('\n') === names.join('\n') && names.includes(message.from) && this.enough()) {
            this.openPlayed(seated, setup, message.payload);
        }
    }

    /**
     * The value of a commitment of the local player, kept in the tab: its page was reloaded, or sealed another value
     * meanwhile, the first commitment in the chain counting
     */
    private restore(from: string, key: Key, commitment: string): void {
        const stored: Readonly<Seal> | undefined = from === this.room.localPlayer.name ? this.sealStore.get(commitment) : undefined;

        if (stored !== undefined) {
            this._seals.update((seals: ReadonlyMap<Key, Readonly<Seal>>) => new Map([...seals, [key, stored]]));
        }
    }

    /** A value of the local player revealed in the chain, refused or withheld: a reload does not need it anymore */
    private revealed(from: string, key: Key): void {
        const commitment: string | undefined = this.commitments.get(key, from);
        if (from === this.room.localPlayer.name && commitment !== undefined) {
            this.sealStore.remove(commitment);
        }
    }

    /**
     * What the local player owes the chain once the messages received are applied: its random part of the draw, its
     * commitment then its reveal, and the reveals of the values it sealed. A page reloaded acts from its tab
     */
    private async act(): Promise<void> {
        const me: number | null = this.myIndex();
        const played: Played = this._played();
        const draw: FairDraw | null = played.draw;
        const game: Game | null = this.game();

        if (me === null || draw === null) {
            return;
        }
        if (game === null) {
            await this.actOnDraw(draw, me);
            return;
        }
        // The game over live, no value is to reveal: the seal of a commitment lost on its way goes too. Not while the page
        // catches up, a game over of the history before the game in progress
        if (this.live && game.result() !== null) {
            this.sealStore.clear();
        }

        const key: Key | null = this.revealKey(game);
        if (key !== null && game.awaited().includes(me)) {
            const seal: Readonly<Seal> | undefined = this._seals().get(key);
            const sent: string = `${ played.id() }:${ key }`;
            if (seal !== undefined && !this.sent.has(sent)) {
                this.sent.add(sent);
                this.transmitReveal(game, seal);
            }
        }
    }

    /** The local player commits to its part of the draw, then reveals it: its part kept in the tab */
    private async actOnDraw(draw: FairDraw, me: number): Promise<void> {
        const context: string = this._played().drawContext;
        const waiting: boolean = draw.waitingFor.includes(this.room.localPlayer.name);

        if (waiting && draw.phase === DrawPhase.COMMITTING && !this.sent.has(`draw:${ context }`)) {
            this.sent.add(`draw:${ context }`);
            // A page reloaded before its commitment came back commits to the same part again: the first one counts
            const part: string = this.partStore.get(context) ?? FairDraw.drawPart();
            this.partStore.save(context, part);
            this.drawRoom.transmitMessage(this.config.types.draw, { ...this.round(), commitment: await FairDraw.commitment(context, me, part) });
        } else if (waiting && draw.phase === DrawPhase.REVEALING && !this.sent.has(`part:${ context }`)) {
            const part: string | undefined = this.partStore.get(context);
            if (part !== undefined) {
                this.sent.add(`part:${ context }`);
                this.drawRoom.transmitMessage(this.config.types.draw, { ...this.round(), part });
            }
        }
    }
}
