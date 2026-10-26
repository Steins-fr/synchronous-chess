import { computed, Signal, signal } from '@angular/core';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { SeatMessage, TableSeats, UnseatMessage } from '@app/modules/two-seat-table/classes/table-seats';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Subscription } from 'rxjs';
import { Cylinder } from '../cylinder/cylinder';
import { CylinderMessage, CylinderMessageType, CylinderPayloads } from '../cylinder/cylinder-messages';
import { CylinderPhase } from '../cylinder/cylinder-state';
import { RouletteGame, RouletteRules } from '../rules/roulette-game';
import { PlayedGame } from './played-game';
import { otherSeat, RouletteSeat, SeatPair } from '../rules/roulette-seat';

export enum RRGameSessionType {
    /** A participant takes a seat, or leaves its seat */
    SEAT = 'RR_seat',
    /** The player to act puts chips on the table */
    PASS = 'RR_pass',
    /** The player to act fires the next chamber */
    SHOOT = 'RR_shoot',
    /** A player tells the time of the move of the other one is over: the other one loses the game */
    TIMEOUT = 'RR_timeout',
    /** A player starts a new game, once the former one is over */
    REMATCH = 'RR_rematch',
    /** A player frees the seat of the other one, away while the seats are open */
    UNSEAT = 'RR_unseat',
}

export interface RouletteMoveMessage {
    /** The index of the game in the room */
    game: number;
    /** The steps of the game before the move: a move of another step is void */
    step: number;
}

export interface RouletteRematchMessage {
    /** The index of the new game in the room, from 0 */
    game: number;
}

export interface RouletteGamePayloads {
    [RRGameSessionType.SEAT]: SeatMessage;
    [RRGameSessionType.PASS]: RouletteMoveMessage;
    [RRGameSessionType.SHOOT]: RouletteMoveMessage;
    [RRGameSessionType.TIMEOUT]: RouletteMoveMessage;
    [RRGameSessionType.REMATCH]: RouletteRematchMessage;
    [RRGameSessionType.UNSEAT]: UnseatMessage;
}

export type RoulettePayloads = RouletteGamePayloads & CylinderPayloads;

type RouletteGameMessage = {
    [Type in keyof RouletteGamePayloads]: AppMessage<Type, RouletteGamePayloads[Type]>;
}[keyof RouletteGamePayloads];

type RouletteMessage = RouletteGameMessage | CylinderMessage;

// The game and its cylinder share their chain: a shot is ordered with the shares it asks for
export const rouletteBlockChains: BlockChainRouting<RoulettePayloads> = {
    [RRGameSessionType.SEAT]: BlockChainName.ROULETTE,
    [RRGameSessionType.PASS]: BlockChainName.ROULETTE,
    [RRGameSessionType.SHOOT]: BlockChainName.ROULETTE,
    [RRGameSessionType.TIMEOUT]: BlockChainName.ROULETTE,
    [RRGameSessionType.REMATCH]: BlockChainName.ROULETTE,
    [RRGameSessionType.UNSEAT]: BlockChainName.ROULETTE,
    [CylinderMessageType.KEY]: BlockChainName.ROULETTE,
    [CylinderMessageType.LOAD]: BlockChainName.ROULETTE,
    [CylinderMessageType.SPIN]: BlockChainName.ROULETTE,
    [CylinderMessageType.SHARE]: BlockChainName.ROULETTE,
    [CylinderMessageType.DISCLOSE]: BlockChainName.ROULETTE,
};

export interface RouletteSessionOptions {
    /** The cipher of the cylinders: the one of the app by default */
    readonly cipher?: ExponentialElGamal;
    /** The rules of the game: the ones of the manga by default */
    readonly rules?: RouletteRules;
}

/** A move the game waits for from a player */
export interface AwaitedMove {
    readonly seat: RouletteSeat;
    /**
     * A move of the player itself (loading its bullets, shooting or passing), which its page plays for it once its time is
     * over, else a step its page makes by itself: missing once the time is over, the page withholds it
     */
    readonly own: boolean;
}

/** The messages of a game in progress, which a broken cylinder stops */
const GAME_MOVES: ReadonlySet<string> = new Set<string>([RRGameSessionType.PASS, RRGameSessionType.SHOOT]);

/**
 * The 24-shot Russian roulette in a room. The participants take the seats themselves, final once a player loaded its
 * bullets until the game is over. Then a player starts a new game, or leaves its seat.
 *
 * Every participant applies the messages of the game and of its cylinder in the order of the chain, one after the other:
 * the players load their bullets and turn the cylinder, then shoot or pass in turn, each shot firing the next chamber
 * with the shares of both players. Once the game is over, the players disclose their keys, and each participant checks
 * the cylinder: until then, the result is provisional, a spin made otherwise than the protocol says deciding the game.
 *
 * The id of a cylinder holds the salt of each player, drawn when it took its seat, and the index of the game in the
 * room: a cylinder of a game in another room of the same name, whose secrets a page may still keep, never has the id of
 * a cylinder of this one, whatever the other player sends, nor does a cylinder of a former game of the room.
 */
export class RussianRouletteSession {
    private readonly _played = signal<PlayedGame>(new PlayedGame(this.options.rules));
    /** The game in progress, else the latest */
    public readonly played: Signal<PlayedGame> = this._played.asReadonly();
    public readonly game: Signal<RouletteGame> = computed((): RouletteGame => this._played().game);
    private readonly _pastGames = signal<ReadonlyArray<Readonly<PlayedGame>>>([]);
    /** The games over before the one in progress, the first one first */
    public readonly pastGames: Signal<ReadonlyArray<Readonly<PlayedGame>>> = this._pastGames.asReadonly();

    private readonly _sending = signal<boolean>(false);
    /** A move of the local player waits for the chain: it acts once only, a second click sending nothing */
    public readonly sending: Signal<boolean> = this._sending.asReadonly();

    /** The seats of the table, open until a player loads its bullets, and once the game is settled */
    public readonly tableSeats = new TableSeats(this.room, {
        types: { seat: RRGameSessionType.SEAT, unseat: RRGameSessionType.UNSEAT },
        open: (): boolean => this.seatsOpen(),
        sending: this.sending,
    });
    /** The players of each seat */
    public readonly seats: Signal<SeatPair<string | null>> = this.tableSeats.seats;

    /** The cylinder of the game in progress, once both seats are taken */
    public readonly cylinder: Signal<Cylinder | null> = computed((): Cylinder | null => this._played().cylinder());
    /** A player gave its key: the seats are final until the game is over */
    public readonly started: Signal<boolean> = computed((): boolean => this._played().started());
    /** The players of the game, the ones of the seats until it started: the seats may change once it is over */
    public readonly players: Signal<SeatPair<string | null>> = computed((): SeatPair<string | null> =>
        this.started() ? this._played().players() : this.seats());
    /** A spin that is not a cylinder, or a chamber not holding 0 to 2 bullets: the game stops */
    public readonly broken: Signal<boolean> = computed((): boolean => this._played().broken());
    /** The game is over, or stopped by a broken cylinder */
    public readonly over: Signal<boolean> = computed((): boolean => this._played().over());
    /**
     * The game is over and waits for no key: its players disclosed them, or one of them lost on time. Its players may play
     * a new one: a new game started before would leave a key of the former one withheld without a clock
     */
    public readonly settled: Signal<boolean> = computed((): boolean => this.over() && this.awaited().length === 0);
    /**
     * The seats are open until a player loads its bullets, and once the game is settled: until then, the player of each
     * seat is the one the game waits for, or the one claiming its time is over
     */
    public readonly seatsOpen: Signal<boolean> = computed((): boolean => !this.started() || this.settled());
    /** The connected participants without a seat */
    public readonly spectatorNumber: Signal<number> = this.tableSeats.spectatorNumber;
    public readonly mySeat: Signal<RouletteSeat | null> = this.tableSeats.mySeat;
    /** The seat of the local player in the game: once over, it may have lost or left it, and still claims a key withheld */
    public readonly myPlayerSeat: Signal<RouletteSeat | null> = computed((): RouletteSeat | null => this.playerSeatOf(this.room.localPlayer.name));
    /** The players of both seats, the ones not connected */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = this.tableSeats.awayPlayers;

    private readonly _step = signal<number>(0);
    /** The moves and the steps of the cylinder applied in the game: a timeout names it, a move made meanwhile voids it */
    public readonly step: Signal<number> = this._step.asReadonly();
    private readonly _historySteps = signal<number>(0);
    /**
     * The steps of the history of the room applied, which a page reloaded or a participant joining late catches up with:
     * the start and the end of each of its messages
     */
    public readonly historySteps: Signal<number> = this._historySteps.asReadonly();

    /**
     * The moves the game waits for, of one player or both: none before a player loads its bullets, nor once it is checked.
     * A game over before its cylinder was spun has no key to disclose
     */
    public readonly awaited: Signal<ReadonlyArray<Readonly<AwaitedMove>>> = computed((): ReadonlyArray<Readonly<AwaitedMove>> => {
        const cylinder: Cylinder | null = this.cylinder();
        const game: RouletteGame = this.game();
        const toAct: RouletteSeat | null = game.toAct();

        if (cylinder === null || !this.started() || this._played().withheld() !== null) {
            return [];
        }
        if (toAct !== null) {
            return [{ seat: toAct, own: true }];
        }
        const phase: CylinderPhase = cylinder.phase();
        if (this.over() && phase !== CylinderPhase.READY && phase !== CylinderPhase.BROKEN) {
            return [];
        }
        // Loading its bullets is a move of the player, the steps of the cylinder after it are made by its page
        const own: boolean = phase === CylinderPhase.KEYS;
        return cylinder.waitingFor().map((player: string): AwaitedMove => ({ seat: cylinder.players.indexOf(player), own }));
    });

    /** Whether the game waits for the local player to shoot or pass */
    public readonly myTurn: Signal<boolean> = computed((): boolean =>
        !this._sending() && this.mySeat() !== null && this.game().toAct() === this.mySeat());

    /** Whether the local player may load its bullets: both seats taken, its key not given, the game not lost on time */
    public readonly canLoad: Signal<boolean> = computed((): boolean => {
        const cylinder: Cylinder | null = this.cylinder();
        return !this._sending() && !this.over() && cylinder?.phase() === CylinderPhase.KEYS && cylinder.waitingFor().includes(this.room.localPlayer.name);
    });

    /** The cipher of every cylinder of the room */
    private readonly cipher: ExponentialElGamal = this.options.cipher ?? new ExponentialElGamal();
    /** The cylinders of every game of the room, by id: a former one may still be disclosed and checked */
    private readonly cylinders = new Map<string, Cylinder>();
    private readonly subscription: Subscription;
    /** The messages apply one after the other: a cylinder checks the proofs of each before the next one */
    private queue: Promise<void> = Promise.resolve();
    private pending: number = 0;

    public constructor(private readonly room: Room<RoulettePayloads>, private readonly options: RouletteSessionOptions = {}) {
        this.subscription = merge(
            ...Object.values(RRGameSessionType).map((type: RRGameSessionType) => room.messenger(type)),
            ...Object.values(CylinderMessageType).map((type: CylinderMessageType) => room.messenger(type)),
        ).subscribe((message: RouletteMessage) => {
            this.pending++;
            this.queue = this.queue.then(async () => {
                await logHandlingFailure(message, this.handle(message));
                // Once the messages received are applied, as a reloaded page catching up: its cylinders act on the chain
                if (--this.pending === 0) {
                    this.cylinders.forEach((cylinder: Cylinder) => void cylinder.act());
                }
            });
        });
    }

    public destroy(): void {
        this.subscription.unsubscribe();
        this.cylinders.forEach((cylinder: Cylinder) => cylinder.destroy());
    }

    public takeSeat(seat: RouletteSeat): void {
        this.tableSeats.takeSeat(seat);
    }

    public leaveSeat(): void {
        this.tableSeats.leaveSeat();
    }

    /** The local player loads its bullets in these chambers */
    public load(chambers: ReadonlyArray<number>): void {
        if (this.canLoad()) {
            this._sending.set(true);
            void (this.cylinder() as Cylinder).load(chambers);
        }
    }

    public pass(): void {
        this.move(RRGameSessionType.PASS);
    }

    public shoot(): void {
        this.move(RRGameSessionType.SHOOT);
    }

    /** The time of the move of the other player is over: it loses the game */
    public claimTimeout(): void {
        this.move(RRGameSessionType.TIMEOUT);
    }

    private move(type: RRGameSessionType.PASS | RRGameSessionType.SHOOT | RRGameSessionType.TIMEOUT): void {
        this._sending.set(true);
        this.room.transmitMessage(type, { game: this._pastGames().length, step: this._step() });
    }

    /** A seated player starts a new game, once the former one is settled */
    public rematch(): void {
        this._sending.set(true);
        this.room.transmitMessage(RRGameSessionType.REMATCH, { game: this._pastGames().length + 1 });
    }

    /** A seated player frees the seat of the other one, away */
    public unseat(seat: RouletteSeat): void {
        this._sending.set(true);
        this.tableSeats.unseat(seat);
    }

    private seatOf(name: string): RouletteSeat | null {
        return this.tableSeats.seatOf(name);
    }

    /** The seat of a player of the game, whatever the seats once it is over */
    private playerSeatOf(name: string): RouletteSeat | null {
        const index: number = this.players().indexOf(name);
        return index === -1 ? null : index;
    }

    private async handle(message: RouletteMessage): Promise<void> {
        const history: boolean = this.room.isHistory(message);
        const step = (): void => this._historySteps.update((steps: number) => steps + 1);

        if (history) {
            step();
        }

        try {
            await this.apply(message);
        } finally {
            if (history) {
                step();
            }
        }
    }

    private async apply(message: RouletteMessage): Promise<void> {
        // The move of the local player is in the chain: it may act again
        if (message.from === this.room.localPlayer.name && message.type !== RRGameSessionType.SEAT) {
            this._sending.set(false);
        }

        // A broken cylinder stops the moves of the game: its seats open, a new game may start
        if (this.broken() && GAME_MOVES.has(message.type)) {
            return;
        }

        switch (message.type) {
            case RRGameSessionType.SEAT:
                if (this.tableSeats.onSeat(message)) {
                    this.prepareCylinder();
                }
                break;
            case RRGameSessionType.PASS:
            case RRGameSessionType.SHOOT:
                this.onMove(message);
                break;
            case RRGameSessionType.TIMEOUT:
                this.onTimeout(message);
                break;
            case RRGameSessionType.REMATCH:
                this.onRematch(message);
                break;
            case RRGameSessionType.UNSEAT:
                if (this.tableSeats.onUnseat(message)) {
                    this.prepareCylinder();
                }
                break;
            default:
                await this.onCylinder(message);
        }
    }

    /**
     * Before the game started, the cylinder of the players of the seats, a new one when they change: the first key given
     * makes them final. Once the game is over, the next one gets its cylinder at its start
     */
    private prepareCylinder(): void {
        const [one, two] = this.tableSeats.seated();

        if (this.started() || this.over()) {
            return;
        }

        const id: string | null = one === null || two === null ? null : `${ one.salt }:${ two.salt }:${ this._pastGames().length }`;
        const former: Cylinder | null = this.cylinder();
        if (id === (former?.id ?? null)) {
            return;
        }

        if (former !== null) {
            this.cylinders.delete(former.id);
        }
        const rules: RouletteRules = this.game().rules;
        const cylinder: Cylinder | null = one === null || two === null || id === null
            ? null
            : new Cylinder(this.room, { id, players: [one.name, two.name], cipher: this.cipher, chambers: rules.chambers, bullets: rules.bullets });
        if (cylinder !== null) {
            this.cylinders.set(cylinder.id, cylinder);
        }
        this._played().prepare(cylinder);
    }

    private onMove(message: AppMessage<RRGameSessionType.PASS | RRGameSessionType.SHOOT, RouletteMoveMessage>): void {
        const seat: RouletteSeat | null = this.seatOf(message.from);
        const { game, step } = message.payload;

        if (seat === null || game !== this._pastGames().length || step !== this._step()) {
            return;
        }

        const legal: boolean = message.type === RRGameSessionType.PASS ? this.game().pass(seat) : this.game().shoot(seat);
        if (!legal) {
            this.room.reportCheat(message, CheatReason.ILLEGAL_MOVE);
            return;
        }

        this._step.update((value: number) => value + 1);
        // A shot fires the next chamber, the 5th pass in a row reveals it
        if (this.game().shooting() !== null || this.game().revealing() !== null) {
            (this.cylinder() as Cylinder).requestShot(this.game().chambers().length);
        }
    }

    /**
     * A player ends the move of the other one once its time was over, unless the move was made before: the chain orders
     * the move and the timeout, the first one counts. A claim of a player the game waits for too is void. The late player
     * loses the game, or, the game over, withholding its key, loses it whatever the chambers fired
     */
    private onTimeout(message: AppMessage<RRGameSessionType.TIMEOUT, RouletteMoveMessage>): void {
        // A player of the game claims, even once it lost its seat: the key of the other one may still be awaited
        const seat: RouletteSeat | null = this.playerSeatOf(message.from);
        const { game, step } = message.payload;
        const awaited: ReadonlySet<RouletteSeat> = new Set(this.awaited().map((move: Readonly<AwaitedMove>) => move.seat));

        if (seat === null || game !== this._pastGames().length || step !== this._step() || awaited.has(seat) || !awaited.has(otherSeat(seat))) {
            return;
        }

        const late: RouletteSeat = otherSeat(seat);
        // A cylinder broken waits for the keys only: a player late withholds its key, it does not lose on time
        if (this.broken() || !this.game().forfeit(late)) {
            this._played().withhold(late);
        }
        // A game over before its cylinder was spun ends it: a step coming late loads nor spins anything
        const cylinder: Cylinder = this.cylinder() as Cylinder;
        if (cylinder.phase() !== CylinderPhase.READY && cylinder.phase() !== CylinderPhase.BROKEN) {
            this.cylinders.delete(cylinder.id);
            cylinder.destroy();
        }
        this._step.update((value: number) => value + 1);
        this._played().discloseOnceOver();
        // The player late loses its seat too: it may not come back, and a spectator may take it for the next game
        this.tableSeats.free(late);
    }

    /**
     * A player starts a new game once the former one is settled, over or stopped by a broken cylinder, both seats taken:
     * the first request starts it, the others name a game started already
     */
    private onRematch(message: AppMessage<RRGameSessionType.REMATCH, RouletteRematchMessage>): void {
        if (this.seatOf(message.from) === null || this.seats().includes(null) || !this.settled() || message.payload.game !== this._pastGames().length + 1) {
            return;
        }

        this._pastGames.update((games: ReadonlyArray<Readonly<PlayedGame>>) => [...games, this._played()]);
        this._played.set(new PlayedGame(this.options.rules));
        this._step.set(0);
        this.prepareCylinder();
    }

    /** A message of a cylinder, of the game in progress or of a former one still checked */
    private async onCylinder(message: CylinderMessage): Promise<void> {
        const cylinder: Cylinder | undefined = this.cylinders.get(message.payload.game);

        if (!cylinder) {
            return;
        }

        const progress: number = cylinder.progress();
        const applied = await cylinder.apply(message);

        if (cylinder !== this.cylinder()) {
            return;
        }
        if (cylinder.progress() !== progress) {
            this._step.update((value: number) => value + 1);
        }

        const first: number | null = cylinder.first();
        if (cylinder.phase() === CylinderPhase.READY && first !== null) {
            this.game().start(first);
        }
        if (applied.fired) {
            this.game().fire(applied.fired.bullets);
        }
        this._played().discloseOnceOver();
    }
}
