import { computed, Signal, signal } from '@angular/core';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';

export interface SeatMessage {
    /** The index of the seat taken, null to leave the seat */
    seat: number | null;
    /** The part of the player in the ids of the decks or of the cylinder of the game, drawn for each seat taken */
    salt?: string;
}

export interface UnseatMessage {
    /** The index of the seat freed */
    seat: number;
    /** The player of the seat, away: a request applied once another one took the seat frees nothing */
    name: string;
}

/** The messages of the seats of a game, by their types */
export type SeatPayloads<Seat extends string, Unseat extends string> = Record<Seat, SeatMessage> & Record<Unseat, UnseatMessage>;

/** A player on its seat, with its part in the ids of the decks or of the cylinder of the game */
export interface SeatedPlayer {
    readonly name: string;
    readonly salt: string;
}

export interface TableSeatsOptions<Seat extends string, Unseat extends string> {
    /** The seats of the table: two at the poker and at the roulette */
    readonly count: number;
    /** The types of the messages of the seats in the game */
    readonly types: { readonly seat: Seat; readonly unseat: Unseat };
    /** Whether the game lets the participants change the seats */
    readonly open: () => boolean;
    /** An action of the local player waits for the chain: it frees no seat meanwhile */
    readonly sending: Signal<boolean>;
}

/** The bytes of the salt of a player */
const SALT_LENGTH: number = 16;
const SALT_PATTERN: RegExp = new RegExp(`^[0-9a-f]{${ 2 * SALT_LENGTH }}$`);

/**
 * The seats of a table, taken by the participants themselves while the game lets them. A participant has a single
 * seat, and draws a salt for each seat it takes: its part in the ids of the secrets of the game. Another seated player,
 * or the host, frees the seat of a player away while the seats are open.
 *
 * The game applies the messages of the seats in the order of its chain, with its other messages: it calls `onSeat()`
 * and `onUnseat()` for them.
 */
export class TableSeats<Seat extends string, Unseat extends string> {
    private readonly _seated = signal<ReadonlyArray<Readonly<SeatedPlayer> | null>>(Array.from({ length: this.options.count }, () => null));
    /** The players of each seat, with their salts */
    public readonly seated: Signal<ReadonlyArray<Readonly<SeatedPlayer> | null>> = this._seated.asReadonly();
    /** The seated players, in the order of their seats, the free seats left out */
    public readonly taken: Signal<ReadonlyArray<Readonly<SeatedPlayer>>> = computed((): ReadonlyArray<Readonly<SeatedPlayer>> =>
        this._seated().filter((player: Readonly<SeatedPlayer> | null): player is Readonly<SeatedPlayer> => player !== null));
    private readonly _seatsTaken = signal<number>(0);
    /** The seats taken live, out of the history of the room: each one is heard */
    public readonly seatsTaken: Signal<number> = this._seatsTaken.asReadonly();
    /** The players of each seat */
    public readonly seats: Signal<ReadonlyArray<string | null>> = computed((): ReadonlyArray<string | null> =>
        this._seated().map((player: Readonly<SeatedPlayer> | null) => player?.name ?? null));
    /** The connected participants without a seat */
    public readonly spectatorNumber: Signal<number> = computed((): number => {
        const seats: ReadonlyArray<string | null> = this.seats();
        return this.room.players().filter(({ name }) => !seats.includes(name)).length;
    });
    public readonly mySeat: Signal<number | null> = computed((): number | null => this.seatOf(this.room.localPlayer.name));
    /** The seated players, the ones not connected */
    public readonly awayPlayers: Signal<ReadonlyArray<string>> = computed((): ReadonlyArray<string> => {
        const connected: ReadonlySet<string> = new Set<string>(this.room.players().map(({ name }) => name));
        return this.seats().filter((name: string | null): name is string => name !== null && !connected.has(name));
    });

    /**
     * The seat at the bottom of the table: the one of the local player. A spectator sees the table from the first free
     * seat it may take, where it shows once seated, else from the first one
     */
    public readonly bottomSeat: Signal<number> = computed((): number =>
        this.mySeat() ?? (this.options.open() ? Math.max(0, this.seats().indexOf(null)) : 0));
    /** The seats going round the table from the bottom one */
    public readonly seatOrder: Signal<ReadonlyArray<number>> = computed((): ReadonlyArray<number> =>
        Array.from({ length: this.options.count }, (_, index: number) => (this.bottomSeat() + index) % this.options.count));

    // The room, as it sends each message of the seats
    private readonly seatRoom: Room<Record<Seat, SeatMessage>> = this.room;
    private readonly unseatRoom: Room<Record<Unseat, UnseatMessage>> = this.room;

    public constructor(private readonly room: Room<SeatPayloads<Seat, Unseat>>, private readonly options: TableSeatsOptions<Seat, Unseat>) {
    }

    public seatOf(name: string): number | null {
        const index: number = this.seats().indexOf(name);
        return index === -1 ? null : index;
    }

    /** A participant without a seat takes a free one while the seats are open */
    public canTake(seat: number): boolean {
        return this.options.open() && this.seats()[seat] === null && this.mySeat() === null;
    }

    /** The local player leaves its seat while the seats are open */
    public canLeave(): boolean {
        return this.options.open() && this.mySeat() !== null;
    }

    /** The local player frees the seat of a player away while the seats are open: the player of another seat, or the host (the sequencer of the room) */
    public canRelease(seat: number): boolean {
        const name: string | null = this.seats()[seat];
        const mySeat: number | null = this.mySeat();
        return this.options.open() && name !== null && this.awayPlayers().includes(name) && !this.options.sending()
            && ((mySeat !== null && mySeat !== seat) || this.room.sequencer() === this.room.localPlayer.name);
    }

    public takeSeat(seat: number): void {
        this.seatRoom.transmitMessage(this.options.types.seat, { seat, salt: CryptoHelper.randomHex(SALT_LENGTH) });
    }

    public leaveSeat(): void {
        this.seatRoom.transmitMessage(this.options.types.seat, { seat: null });
    }

    /** A seated player frees the seat of another one, away, or the host the seat of a player away */
    public unseat(seat: number): void {
        this.unseatRoom.transmitMessage(this.options.types.unseat, { seat, name: this.seats()[seat] as string });
    }

    /**
     * A participant has a single seat: taking a seat leaves its former one. The first request for a free seat gets it,
     * with the salt of its player
     *
     * @returns whether the request applied to open seats, though a seat taken already or a wrong salt changes none
     */
    public onSeat(message: AppMessage<Seat, SeatMessage>): boolean {
        const { seat, salt } = message.payload;

        if (!this.options.open() || (seat !== null && !this.isSeat(seat))) {
            return false;
        }

        const previous: ReadonlyArray<Readonly<SeatedPlayer> | null> = this._seated();
        const left: ReadonlyArray<Readonly<SeatedPlayer> | null> = previous.map((player: Readonly<SeatedPlayer> | null) => player?.name === message.from ? null : player);

        if (seat === null) {
            this._seated.set(left);
        } else if (left[seat] === null && typeof salt === 'string' && SALT_PATTERN.test(salt)) {
            this._seated.set(withSeatAt(left, seat, { name: message.from, salt }));
            // A seat asked again by its player (a second click before the first one came back) is no seat taken
            if (previous[seat]?.name !== message.from && !this.room.isHistory(message)) {
                this._seatsTaken.update((taken: number) => taken + 1);
            }
        }
        return true;
    }

    /**
     * A seated player frees the seat of another one while the seats are open, its page seeing it away: no page can
     * tell when it was, as for a timeout. The host frees one too, even a spectator: it may take the seat then
     *
     * @returns whether the seat was freed
     */
    public onUnseat(message: AppMessage<Unseat, UnseatMessage>): boolean {
        const seat: number | null = this.seatOf(message.from);
        const { seat: freed, name } = message.payload;
        // The host decides as the sequencer of its block: a page replaying the chain, or joining late, applies it alike
        const allowed: boolean = (seat !== null && freed !== seat) || this.room.sequencedBy(message) === message.from;

        if (!this.options.open() || !this.isSeat(freed) || !allowed || this.seats()[freed] !== name) {
            return false;
        }

        this.free(freed);
        return true;
    }

    /** The player of the seat loses it, late or away */
    public free(seat: number): void {
        this._seated.update((seats: ReadonlyArray<Readonly<SeatedPlayer> | null>) => withSeatAt(seats, seat, null));
    }

    /** The index of a seat of the table, as a payload may carry anything */
    private isSeat(seat: unknown): seat is number {
        return Number.isInteger(seat) && (seat as number) >= 0 && (seat as number) < this.options.count;
    }
}

/** The seats changed for one only */
function withSeatAt<T>(seats: ReadonlyArray<T>, seat: number, value: T): ReadonlyArray<T> {
    return seats.map((current: T, index: number) => index === seat ? value : current);
}
