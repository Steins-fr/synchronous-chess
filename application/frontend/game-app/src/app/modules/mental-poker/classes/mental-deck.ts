import { Signal, signal } from '@angular/core';
import { wait } from '@app/helpers/wait.helper';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { Room } from '@app/services/room-manager/classes/room/room';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { MentalDeckMessage, MentalDeckMessageType, MentalDeckPayloads } from '../mental-deck-messages';
import { DeckKeyStore, DeckSecrets } from './deck-key-store';
import { verifyDeck } from './deck-verification';
import { DeckCheat, DeckPhase, DeckStep, MentalDeckState, PublishedKey } from './mental-deck-state';
import { SraCipher } from './sra-cipher';

export enum DeckVerification {
    /** The players did not disclose their keys yet */
    PENDING = 'pending',
    CHECKING = 'checking',
    FAIR = 'fair',
    CHEATED = 'cheated',
}

export interface MentalDeckOptions {
    /**
     * Unique to the deck, in the room and across the rooms of the same name: a random part, drawn by the game and given
     * in the chain, keeps a player from reusing the secrets of a former deck it disclosed
     */
    id: string;
    /** The number of cards, the game names the card of each index */
    size: number;
    /** The players shuffling the deck, in the same order for every participant; the others are spectators */
    players: ReadonlyArray<string>;
    cipher?: SraCipher;
    store?: DeckKeyStore;
}

/** The secrets of the local player, as numbers */
interface Secrets {
    shuffleKey: bigint;
    permutation: ReadonlyArray<number>;
    /** The keys encrypting the cards, by position */
    cardKeys: ReadonlyArray<bigint>;
    /** The keys decrypting them, the ones the player gives */
    cardUnlockKeys: ReadonlyArray<bigint>;
}

interface Waiter {
    positions: ReadonlyArray<number>;
    resolve: () => void;
    reject: (reason: Error) => void;
}

/**
 * A deck of cards no participant can see, played without any dealer: the mental poker of Shamir, Rivest and Adleman.
 * Each player encrypts the deck with a key of its own and shuffles it, then replaces this key with a different key on
 * each card. A card is read with the keys of every player: the game deals it by asking the keys of all the players
 * but its recipient, who keeps its own; it opens it by asking the keys of all the players.
 *
 * The game creates the deck with its `MentalDeckTable`, deals and opens its cards as its own messages apply, in the order
 * of the chain, on every participant: the players give their keys by themselves. What the deck tells the game is the same for everyone
 * (`phase`, `waitingFor`, the promises), but what the local participant reads (`cards`).
 * Once the game is over, the players disclose all their keys: every participant checks the deck, and reports the cheats.
 */
export class MentalDeck {
    public readonly id: string;
    private readonly state: MentalDeckState;
    private readonly cipher: SraCipher;
    private readonly store: DeckKeyStore;
    private readonly localName: string;

    private readonly _phase = signal<DeckPhase>(DeckPhase.SHUFFLING);
    public readonly phase: Signal<DeckPhase> = this._phase.asReadonly();
    private readonly _waitingFor = signal<ReadonlyArray<string>>([]);
    /** The players the deck waits for */
    public readonly waitingFor: Signal<ReadonlyArray<string>> = this._waitingFor.asReadonly();
    private readonly _cards = signal<ReadonlyMap<number, number>>(new Map<number, number>());
    /** The cards the local participant reads, by position: the ones dealt to it and the open ones, every card once disclosed */
    public readonly cards: Signal<ReadonlyMap<number, number>> = this._cards.asReadonly();
    private readonly _verification = signal<DeckVerification>(DeckVerification.PENDING);
    public readonly verification: Signal<DeckVerification> = this._verification.asReadonly();

    private secrets?: Secrets;
    /** The cards the local participant decrypted, undefined for a key not giving any card */
    private readonly decrypted = new Map<number, number | undefined>();
    /** The decks the local player made in this page, sent unless the chain had its step already */
    private readonly madeSteps = new Map<DeckPhase, ReadonlyArray<string>>();
    /** What the local player sent in this page: once in the chain, it is not sent again */
    private readonly sentKeys = new Set<number>();
    private sentDisclosure: boolean = false;
    private waiters: Waiter[] = [];
    /** Resolves once every player disclosed its keys, and the deck is checked */
    private readonly verified: Promise<DeckVerification>;
    private resolveVerified!: (verification: DeckVerification) => void;
    private secretsLost: boolean = false;
    /** The card of each value, once decrypted */
    private readonly cardOfValue: ReadonlyMap<bigint, number>;
    private acting: boolean = false;
    private actAgain: boolean = false;
    private destroyed: boolean = false;

    /**
     * @param received the messages of the deck received before the game created it, in the order of the chain: they apply
     * before the deck acts, a reloaded page finding its steps in them
     */
    public constructor(private readonly room: Room<MentalDeckPayloads>, options: Readonly<MentalDeckOptions>, received: ReadonlyArray<MentalDeckMessage> = []) {
        this.id = options.id;
        this.cipher = options.cipher ?? new SraCipher();
        this.localName = room.localPlayer.name;
        this.store = options.store ?? new DeckKeyStore(room.roomName, this.localName);
        this.state = new MentalDeckState(options.size, options.players, this.cipher);
        this.verified = new Promise<DeckVerification>((resolve) => this.resolveVerified = resolve);
        this.cardOfValue = new Map(Array.from({ length: options.size }, (_, card: number) => [this.cipher.encode(card), card]));
        received.forEach((message: MentalDeckMessage) => this.apply(message));
        this.changed();
    }

    public get players(): ReadonlyArray<string> {
        return this.state.players;
    }

    private get isPlayer(): boolean {
        return this.state.players.includes(this.localName);
    }

    /**
     * Gives these cards to a player: the others give their keys, the recipient reads them
     * @returns resolves once every key is in the chain, and the recipient read the cards; rejects for a broken deck
     */
    public deal(positions: ReadonlyArray<number>, recipient: string): Promise<void> {
        this.state.deal(positions, recipient);
        return this.waitFor(positions);
    }

    /**
     * Shows these cards to everyone: every player gives its key
     * @returns the cards once every participant can read them, undefined for a key not giving any; rejects for a broken deck
     */
    public open(positions: ReadonlyArray<number>): Promise<ReadonlyMap<number, number | undefined>> {
        this.state.open(positions);
        return this.waitFor(positions).then(() => new Map(positions.map((position: number) => [position, this.decrypted.get(position)])));
    }

    /**
     * Once the game is over: every player gives all its keys, the participants check the deck and read every card
     * @returns resolves once the deck is checked
     */
    public disclose(): Promise<DeckVerification> {
        this.state.requestDisclosure();
        this.changed();
        return this.verified;
    }

    public destroy(): void {
        this.destroyed = true;
    }

    private waitFor(positions: ReadonlyArray<number>): Promise<void> {
        const settled = new Promise<void>((resolve, reject) => this.waiters.push({ positions, resolve, reject }));
        this.changed();
        return settled;
    }

    /** The messages of the deck from every participant, the local one included, in the order of the chain */
    public receive(message: MentalDeckMessage): void {
        if (!this.destroyed) {
            this.apply(message);
            this.changed();
        }
    }

    private apply(message: MentalDeckMessage): void {
        const cheat: DeckCheat | undefined = this.state.apply(message);

        if (cheat) {
            this.room.reportCheat(cheat.message, cheat.reason);
        }

        if (message.from === this.localName) {
            this.checkOwnSteps();
        }
    }

    /** Tells the state of the chain, then acts on it */
    private changed(): void {
        this._phase.set(this.state.phase);
        this._waitingFor.set(this.state.waitingFor);
        this.settleWaiters();
        void this.act();
    }

    /** What the deck waits for from the local participant, one thing at a time, again when the chain changed meanwhile */
    private async act(): Promise<void> {
        if (this.acting) {
            this.actAgain = true;
            return;
        }

        this.acting = true;

        try {
            do {
                this.actAgain = false;
                // eslint-disable-next-line no-await-in-loop -- one thing at a time
                await this.actOnce();
            } while (this.actAgain && !this.destroyed);
        } catch (error: unknown) {
            TimedLogger.error(`The deck ${ this.id } failed`, error);
        } finally {
            this.acting = false;
        }
    }

    private async actOnce(): Promise<void> {
        await this.playStep();
        await this.giveKeys();
        this.giveDisclosure();
        await this.readCards();
        this.settleWaiters();
        await this.verify();
    }

    /** Shuffles or locks the deck, when it is the turn of the local player */
    private async playStep(): Promise<void> {
        const phase: DeckPhase = this.state.phase;

        if (this.state.stepAuthor !== this.localName || this.madeSteps.has(phase)) {
            return;
        }

        const secrets: Secrets | undefined = this.loadSecrets(phase === DeckPhase.SHUFFLING);

        if (!secrets) {
            return;
        }

        const input: ReadonlyArray<bigint> = this.state.stepInput;
        const cards: ReadonlyArray<string> = (phase === DeckPhase.SHUFFLING ? await this.computeShuffle(input, secrets) : await this.computeLock(input, secrets))
            .map((card: bigint) => SraCipher.toHex(card));
        this.madeSteps.set(phase, cards);

        if (this.destroyed) {
            return;
        }

        if (this.state.stepAuthor === this.localName && this.state.phase === phase) {
            this.room.transmitMessage(phase === DeckPhase.SHUFFLING ? MentalDeckMessageType.SHUFFLE : MentalDeckMessageType.LOCK, { deck: this.id, cards });
        } else {
            // A reloaded page found its step of a former page in the chain meanwhile
            this.checkOwnSteps();
        }
    }

    /**
     * The steps of the local player in the chain are the decks it made with its secrets: else its secrets are not the
     * ones of a former page, which a page without storage drew again, and would give wrong keys
     */
    private checkOwnSteps(): void {
        for (const [phase, cards] of this.madeSteps) {
            const step: DeckStep | undefined = (phase === DeckPhase.SHUFFLING ? this.state.shuffles : this.state.locks)
                .find(({ message }) => message.from === this.localName);

            if (step?.cards.some((card: bigint, position: number) => SraCipher.toHex(card) !== cards[position])) {
                this.secrets = undefined;
                this.madeSteps.clear();
                this.store.remove(this.id);
                this.loseSecrets();
            }
        }
    }

    /** Once: lost, the secrets are not looked for again */
    private loseSecrets(): void {
        this.secretsLost = true;
        TimedLogger.warn(`The keys of the deck ${ this.id } are lost, its cards can not be read`);
    }

    private async computeShuffle(input: ReadonlyArray<bigint>, secrets: Secrets): Promise<ReadonlyArray<bigint>> {
        const encrypted: bigint[] = [];

        for (const card of input) {
            encrypted.push(this.cipher.apply(card, secrets.shuffleKey));
            // eslint-disable-next-line no-await-in-loop -- one computation at a time, for the page to stay fluid
            await wait(0);
        }

        return secrets.permutation.map((from: number) => encrypted[from]);
    }

    private async computeLock(input: ReadonlyArray<bigint>, secrets: Secrets): Promise<ReadonlyArray<bigint>> {
        const unshuffle: bigint = this.cipher.inverse(secrets.shuffleKey);
        const locked: bigint[] = [];

        for (const [position, card] of input.entries()) {
            locked.push(this.cipher.apply(card, this.cipher.combine([unshuffle, secrets.cardKeys[position]])));
            // eslint-disable-next-line no-await-in-loop -- one computation at a time, for the page to stay fluid
            await wait(0);
        }

        return locked;
    }

    /**
     * The secrets of the local player, stored before anything made with them is sent
     * @param draw draws them when none is stored: only before the player shuffled the deck, other secrets would not
     * match its deck in the chain
     */
    private loadSecrets(draw: boolean = false): Secrets | undefined {
        if (this.secrets || this.secretsLost) {
            return this.secrets;
        }

        let stored: Readonly<DeckSecrets> | undefined = this.store.get(this.id);

        if (!stored && draw) {
            stored = this.drawSecrets();
            this.store.save(this.id, stored);
        }

        if (!stored) {
            this.loseSecrets();
            return undefined;
        }

        const cardKeys: ReadonlyArray<bigint> = stored.cardKeys.map((key: string) => BigInt(`0x${ key }`));
        this.secrets = {
            shuffleKey: BigInt(`0x${ stored.shuffleKey }`),
            permutation: stored.permutation,
            cardKeys,
            cardUnlockKeys: cardKeys.map((key: bigint) => this.cipher.inverse(key)),
        };
        return this.secrets;
    }

    private drawSecrets(): DeckSecrets {
        const permutation: number[] = Array.from({ length: this.state.size }, (_, index: number) => index);

        // Fisher-Yates
        for (let index = permutation.length - 1; index > 0; index--) {
            const other: number = Number(CryptoHelper.randomBigInt(BigInt(index + 1)));
            [permutation[index], permutation[other]] = [permutation[other], permutation[index]];
        }

        return {
            shuffleKey: SraCipher.toHex(this.cipher.randomKey()),
            permutation,
            cardKeys: permutation.map(() => SraCipher.toHex(this.cipher.randomKey())),
        };
    }

    /** The keys of the local player the game asked for */
    private async giveKeys(): Promise<void> {
        if (this.state.phase !== DeckPhase.READY || !this.isPlayer) {
            return;
        }

        if (this.unsentKeys().length === 0) {
            return;
        }

        // The keys asked by the messages of the same block go together, a reloaded page may find the ones of its former page
        await wait(0);
        const positions: ReadonlyArray<number> = this.unsentKeys();
        const secrets: Secrets | undefined = this.loadSecrets();

        if (this.destroyed || positions.length === 0 || !secrets) {
            return;
        }

        positions.forEach((position: number) => this.sentKeys.add(position));
        this.room.transmitMessage(MentalDeckMessageType.KEYS, {
            deck: this.id,
            keys: positions.map((position: number) => ({ position, key: SraCipher.toHex(secrets.cardUnlockKeys[position]) })),
        });
    }

    private unsentKeys(): ReadonlyArray<number> {
        return this.state.missingKeys(this.localName).filter((position: number) => !this.sentKeys.has(position));
    }

    private giveDisclosure(): void {
        if (this.sentDisclosure || !this.isPlayer || !this.state.isDisclosureRequested || this.state.disclosures.has(this.localName)
            || this.state.phase !== DeckPhase.READY) {
            return;
        }

        const secrets: Secrets | undefined = this.loadSecrets();

        if (secrets) {
            this.sentDisclosure = true;
            this.room.transmitMessage(MentalDeckMessageType.DISCLOSE, {
                deck: this.id,
                shuffleKey: SraCipher.toHex(secrets.shuffleKey),
                cardKeys: secrets.cardUnlockKeys.map((key: bigint) => SraCipher.toHex(key)),
            });
        }
    }

    /** Decrypts the cards whose keys the local participant has, all of them once disclosed */
    private async readCards(): Promise<void> {
        if (this.state.phase !== DeckPhase.READY) {
            return;
        }

        for (let position = 0; position < this.state.size; position++) {
            const keys: ReadonlyArray<bigint> | undefined = this.decrypted.has(position) ? undefined : this.readingKeys(position);

            if (keys) {
                const value: bigint = this.cipher.apply(this.state.lockedDeck[position], this.cipher.combine(keys));
                this.read(position, this.cardOfValue.get(value));
                // eslint-disable-next-line no-await-in-loop -- one computation at a time, for the page to stay fluid
                await wait(0);
            }
        }
    }

    /**
     * The keys of every player of a card, once the local participant has them: the ones in the chain, the secret one of
     * the local player when it is not, so a card every key opened reads alike for everyone
     */
    private readingKeys(position: number): ReadonlyArray<bigint> | undefined {
        const keys: Array<bigint | undefined> = this.state.players.map((player: string) => this.state.keyOf(position, player));
        const own: number = this.state.players.indexOf(this.localName);

        // The secrets of the local player are looked for once the other keys are there only
        if (own !== -1 && keys[own] === undefined && keys.every((key: bigint | undefined, index: number) => key !== undefined || index === own)) {
            keys[own] = this.loadSecrets()?.cardUnlockKeys[position];
        }

        return keys.includes(undefined) ? undefined : keys as ReadonlyArray<bigint>;
    }

    private read(position: number, card: number | undefined): void {
        this.decrypted.set(position, card);

        if (card !== undefined) {
            this._cards.update((cards: ReadonlyMap<number, number>) => new Map(cards).set(position, card));
            return;
        }

        // Read with the key of the local player and the one of a single other player: the other one is wrong
        const others: ReadonlyArray<string> = this.state.players.filter((player: string) => player !== this.localName);
        const published: Readonly<PublishedKey> | undefined = this.state.publishedKeys(position).get(others[0]);

        if (this.isPlayer && others.length === 1 && published) {
            this.room.reportCheat(published.message, CheatReason.INVALID_CARD_KEY);
        }
    }

    /** Resolves the deals and the openings once their keys are in the chain, and the local participant read them */
    private settleWaiters(): void {
        if (this.state.phase === DeckPhase.BROKEN) {
            this.waiters.forEach((waiter: Waiter) => waiter.reject(new Error(`The deck ${ this.id } is broken`)));
            this.waiters = [];
            this.breakVerification();
            return;
        }

        this.waiters = this.waiters.filter((waiter: Waiter) => {
            const settled: boolean = waiter.positions.every((position: number) => this.state.isSettled(position)
                && (this.decrypted.has(position) || this.readingKeys(position) === undefined));

            if (settled) {
                waiter.resolve();
            }

            return !settled;
        });
    }

    /** A broken deck is cheated: its game does not wait for a disclosure that never comes, and its secrets are useless */
    private breakVerification(): void {
        if (this._verification() !== DeckVerification.CHEATED) {
            this._verification.set(DeckVerification.CHEATED);
            this.store.remove(this.id);
            this.resolveVerified(DeckVerification.CHEATED);
        }
    }

    /** Once every player disclosed its keys */
    private async verify(): Promise<void> {
        if (!this.state.isDisclosed || this._verification() !== DeckVerification.PENDING) {
            return;
        }

        this._verification.set(DeckVerification.CHECKING);
        const cheats: ReadonlyArray<DeckCheat> = await verifyDeck(this.state, this.cipher, () => wait(0));
        cheats.forEach((cheat: DeckCheat) => this.room.reportCheat(cheat.message, cheat.reason));
        const verification: DeckVerification = cheats.length === 0 ? DeckVerification.FAIR : DeckVerification.CHEATED;
        this._verification.set(verification);
        // Disclosed, the secrets are not secret anymore
        this.store.remove(this.id);
        this.resolveVerified(verification);
    }
}
