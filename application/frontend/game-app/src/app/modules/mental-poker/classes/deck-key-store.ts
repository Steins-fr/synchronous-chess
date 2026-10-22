import { TimedLogger } from '@app/helpers/timed-logger.helper';

/** What a player keeps secret of a deck until the game is over, its keys in hexadecimal */
export interface DeckSecrets {
    /** The key encrypting the deck before the player shuffles it */
    shuffleKey: string;
    /** Where the player put each card when it shuffled the deck */
    permutation: ReadonlyArray<number>;
    /** The key encrypting each card, by position, once the player locked the deck */
    cardKeys: ReadonlyArray<string>;
}

/**
 * Keeps in the tab the secrets of the player for each deck, stored before it sends anything made with them: once the page
 * is reloaded, the player still reads its cards and gives its keys. The secrets of a deck are never drawn again, the
 * deck in the chain being made with the first ones.
 */
export class DeckKeyStore {
    private static readonly PREFIX: string = 'synchronous-chess:deck-keys';

    private readonly prefix: string;

    /**
     * @param storage the session storage of the browser, read on use: it throws when the storage is blocked
     */
    public constructor(
        roomName: string,
        playerName: string,
        private readonly storage: () => Storage = () => globalThis.sessionStorage,
    ) {
        this.prefix = `${ DeckKeyStore.PREFIX }:${ roomName }:${ playerName }`;
    }

    public get(deck: string): Readonly<DeckSecrets> | undefined {
        try {
            const secrets: string | null = this.storage().getItem(this.key(deck));
            return secrets === null ? undefined : JSON.parse(secrets);
        } catch (error: unknown) {
            TimedLogger.warn('The keys of the deck can not be read, a reload can not read its cards', error);
            return undefined;
        }
    }

    public save(deck: string, secrets: Readonly<DeckSecrets>): void {
        try {
            this.storage().setItem(this.key(deck), JSON.stringify(secrets));
        } catch (error: unknown) {
            // Private browsing or blocked site data: a reload loses the cards of the player
            TimedLogger.warn('The keys of the deck can not be stored, a reload can not read its cards', error);
        }
    }

    /** Once disclosed, the secrets of a deck are not secret anymore */
    public remove(deck: string): void {
        try {
            this.storage().removeItem(this.key(deck));
        } catch (error: unknown) {
            TimedLogger.warn('The keys of the deck can not be removed', error);
        }
    }

    private key(deck: string): string {
        return `${ this.prefix }:${ deck }`;
    }
}
