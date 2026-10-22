import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { CardKey, MentalDeckMessage, MentalDeckMessageType } from '../mental-deck-messages';
import { SraCipher } from './sra-cipher';

export enum DeckPhase {
    /** The players encrypt and shuffle the deck, one after the other */
    SHUFFLING = 'shuffling',
    /** The players put a key of their own on each card, one after the other */
    LOCKING = 'locking',
    /** The cards can be dealt and opened */
    READY = 'ready',
    /** A player sent a deck that is not one: no card can be dealt */
    BROKEN = 'broken',
}

/** The deck as a player left it, in the chain */
export interface DeckStep {
    message: MentalDeckMessage;
    cards: ReadonlyArray<bigint>;
}

export interface PublishedKey {
    message: MentalDeckMessage;
    key: bigint;
}

export interface Disclosure {
    message: MentalDeckMessage;
    shuffleKey: bigint;
    cardKeys: ReadonlyArray<bigint>;
}

/** A message the deck finds cheated, to report */
export interface DeckCheat {
    message: MentalDeckMessage;
    reason: CheatReason;
}

/**
 * What the chain tells of a deck: the decks the players left, the keys they gave and the ones the game asks for.
 * The messages apply in the order of the chain, the game asking for keys as its own messages apply: every participant
 * gets the same state, the same cheats included.
 */
export class MentalDeckState {
    public readonly shuffles: DeckStep[] = [];
    public readonly locks: DeckStep[] = [];
    /** The players whose key the game asked for, by position */
    private readonly requests = new Map<number, Set<string>>();
    /** The keys the players gave, by position then player */
    private readonly keys = new Map<number, Map<string, PublishedKey>>();
    public readonly disclosures = new Map<string, Disclosure>();
    private disclosureRequested: boolean = false;
    private broken: boolean = false;

    /**
     * @param size the number of cards
     * @param players the players shuffling and locking the deck, in this order
     */
    public constructor(
        public readonly size: number,
        public readonly players: ReadonlyArray<string>,
        private readonly cipher: SraCipher,
    ) {
        if (new Set(players).size !== players.length || players.length < 2) {
            throw new Error(`A deck is played by 2 different players at least, not ${ players.join(', ') }`);
        }
    }

    public get phase(): DeckPhase {
        if (this.broken) {
            return DeckPhase.BROKEN;
        }

        if (this.shuffles.length < this.players.length) {
            return DeckPhase.SHUFFLING;
        }

        return this.locks.length < this.players.length ? DeckPhase.LOCKING : DeckPhase.READY;
    }

    /** The player who shuffles or locks the deck next */
    public get stepAuthor(): string | undefined {
        switch (this.phase) {
            case DeckPhase.SHUFFLING:
                return this.players[this.shuffles.length];
            case DeckPhase.LOCKING:
                return this.players[this.locks.length];
            default:
                return undefined;
        }
    }

    /** The deck to shuffle or lock next: the cards themselves for the first player */
    public get stepInput(): ReadonlyArray<bigint> {
        if (this.phase === DeckPhase.SHUFFLING) {
            return this.shuffles.at(-1)?.cards ?? Array.from({ length: this.size }, (_, card: number) => this.cipher.encode(card));
        }

        // Locking, the deck is shuffled already
        return ((this.locks.at(-1) ?? this.shuffles.at(-1)) as DeckStep).cards;
    }

    /** The deck once every player locked it, the cards being dealt from it */
    public get lockedDeck(): ReadonlyArray<bigint> {
        return this.locks[this.players.length - 1].cards;
    }

    public get isDisclosed(): boolean {
        return this.disclosures.size === this.players.length;
    }

    /** The keys of these positions go to the recipient only: every other player gives its own */
    public deal(positions: ReadonlyArray<number>, recipient: string): void {
        if (!this.players.includes(recipient)) {
            throw new Error(`${ recipient } plays no deck`);
        }

        this.request(positions, this.players.filter((player: string) => player !== recipient));
    }

    /** The keys of these positions go to everyone: every player gives its own */
    public open(positions: ReadonlyArray<number>): void {
        this.request(positions, this.players);
    }

    public requestDisclosure(): void {
        this.disclosureRequested = true;
    }

    public get isDisclosureRequested(): boolean {
        return this.disclosureRequested;
    }

    /** The positions whose key of this player the game asked for, and the chain does not have */
    public missingKeys(player: string): ReadonlyArray<number> {
        return [...this.requests.entries()]
            .filter(([position, holders]) => holders.has(player) && this.keyOf(position, player) === undefined)
            .map(([position]) => position);
    }

    /** The players the deck waits for: to shuffle or lock it, to give the keys asked for or to disclose theirs */
    public get waitingFor(): ReadonlyArray<string> {
        if (this.phase === DeckPhase.BROKEN) {
            return [];
        }

        const author: string | undefined = this.stepAuthor;

        if (author !== undefined) {
            return [author];
        }

        return this.players.filter((player: string) => this.missingKeys(player).length > 0
            || (this.disclosureRequested && !this.disclosures.has(player)));
    }

    /** Every key the game asked for of this position is in the chain */
    public isSettled(position: number): boolean {
        if (this.phase !== DeckPhase.READY) {
            return false;
        }

        const holders: ReadonlySet<string> = this.requests.get(position) ?? new Set<string>();
        return [...holders].every((player: string) => this.keyOf(position, player) !== undefined);
    }

    /** The key of a player for a card, given for the card or disclosed */
    public keyOf(position: number, player: string): bigint | undefined {
        return this.keys.get(position)?.get(player)?.key ?? this.disclosures.get(player)?.cardKeys[position];
    }

    public publishedKeys(position: number): ReadonlyMap<string, Readonly<PublishedKey>> {
        return this.keys.get(position) ?? new Map<string, PublishedKey>();
    }

    /**
     * A message of the deck, in the order of the chain. A message out of its turn is ignored: the first one of a player
     * for a step is final, a reloaded page may send it again.
     * @returns the cheat of the message, if any
     */
    public apply(message: MentalDeckMessage): DeckCheat | undefined {
        if (!this.players.includes(message.from) || this.phase === DeckPhase.BROKEN) {
            return undefined;
        }

        switch (message.type) {
            case MentalDeckMessageType.SHUFFLE:
                return this.applyStep(message, DeckPhase.SHUFFLING, this.shuffles);
            case MentalDeckMessageType.LOCK:
                return this.applyStep(message, DeckPhase.LOCKING, this.locks);
            case MentalDeckMessageType.KEYS:
                return this.applyKeys(message);
            case MentalDeckMessageType.DISCLOSE:
                return this.applyDisclosure(message);
            default:
                return undefined;
        }
    }

    private request(positions: ReadonlyArray<number>, holders: ReadonlyArray<string>): void {
        if (!positions.every((position: number) => Number.isInteger(position) && position >= 0 && position < this.size)) {
            throw new Error(`No card at ${ positions.join(', ') }`);
        }

        positions.forEach((position: number) => {
            const requested: Set<string> = this.requests.get(position) ?? new Set<string>();
            holders.forEach((holder: string) => requested.add(holder));
            this.requests.set(position, requested);
        });
    }

    private applyStep(message: MentalDeckMessage & { type: MentalDeckMessageType.SHUFFLE | MentalDeckMessageType.LOCK }, phase: DeckPhase, steps: DeckStep[]): DeckCheat | undefined {
        if (this.phase !== phase || this.stepAuthor !== message.from) {
            return undefined;
        }

        const cards: ReadonlyArray<bigint | undefined> = Array.isArray(message.payload.cards)
            ? message.payload.cards.map((card: unknown) => this.cipher.parseValue(card))
            : [];
        const valid: boolean = cards.length === this.size
            && cards.every((card: bigint | undefined) => card !== undefined)
            // Each card of an honest deck is a different one
            && new Set(cards).size === this.size;

        if (!valid) {
            this.broken = true;
            return { message, reason: CheatReason.INVALID_SHUFFLE };
        }

        steps.push({ message, cards: cards as ReadonlyArray<bigint> });
        return undefined;
    }

    /** The keys of a player, whether the game asked for them yet or not: its messages may apply after the keys */
    private applyKeys(message: MentalDeckMessage & { type: MentalDeckMessageType.KEYS }): DeckCheat | undefined {
        if (this.phase !== DeckPhase.READY) {
            return undefined;
        }

        const given: unknown = message.payload.keys;
        const keys: ReadonlyArray<[number, bigint] | undefined> = Array.isArray(given) ? given.map((key: unknown) => this.parseCardKey(key)) : [undefined];

        if (keys.includes(undefined)) {
            return { message, reason: CheatReason.INVALID_CARD_KEY };
        }

        (keys as ReadonlyArray<[number, bigint]>).forEach(([position, key]) => {
            const published: Map<string, PublishedKey> = this.keys.get(position) ?? new Map<string, PublishedKey>();

            // The first key of a player for a card is final
            if (!published.has(message.from)) {
                published.set(message.from, { message, key });
                this.keys.set(position, published);
            }
        });
        return undefined;
    }

    private parseCardKey(cardKey: unknown): [number, bigint] | undefined {
        const { position, key } = (typeof cardKey === 'object' && cardKey !== null ? cardKey : {}) as Partial<Record<keyof CardKey, unknown>>;
        const parsed: bigint | undefined = this.cipher.parseKey(key);

        return Number.isInteger(position) && (position as number) >= 0 && (position as number) < this.size && parsed !== undefined
            ? [position as number, parsed]
            : undefined;
    }

    /** The disclosure of a player, whether the game asked for it yet or not: its messages may apply after it */
    private applyDisclosure(message: MentalDeckMessage & { type: MentalDeckMessageType.DISCLOSE }): DeckCheat | undefined {
        if (this.phase !== DeckPhase.READY || this.disclosures.has(message.from)) {
            return undefined;
        }

        const shuffleKey: bigint | undefined = this.cipher.parseKey(message.payload.shuffleKey);
        const cardKeys: ReadonlyArray<bigint | undefined> = Array.isArray(message.payload.cardKeys)
            ? message.payload.cardKeys.map((key: unknown) => this.cipher.parseKey(key))
            : [];

        if (shuffleKey === undefined || cardKeys.length !== this.size || cardKeys.includes(undefined)) {
            return { message, reason: CheatReason.INVALID_CARD_KEY };
        }

        this.disclosures.set(message.from, { message, shuffleKey, cardKeys: cardKeys as ReadonlyArray<bigint> });
        return undefined;
    }
}
