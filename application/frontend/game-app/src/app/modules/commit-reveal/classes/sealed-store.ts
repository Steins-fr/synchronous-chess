import { TimedLogger } from '@app/helpers/timed-logger.helper';

/** The id of a sealed value: the turn of the chess, the lot of an auction... */
export type SealedId = string | number;

/**
 * Keeps in the tab the values the player committed to and has not revealed yet, by id: once the page is reloaded,
 * the player can still reveal them. A stored value is only used if it matches the commitment in the chain, so the
 * ones of a previous game in a room of the same name are ignored.
 */
export class SealedStore<T> {
    private static readonly PREFIX: string = 'synchronous-chess:sealed';

    private readonly key: string;

    /**
     * @param kind what the values are, each kind kept apart: `turns` for the chess
     * @param storage the session storage of the browser, read on use: it throws when the storage is blocked
     */
    public constructor(
        kind: string,
        roomName: string,
        playerName: string,
        private readonly storage: () => Storage = () => globalThis.sessionStorage,
    ) {
        this.key = `${ SealedStore.PREFIX }-${ kind }:${ roomName }:${ playerName }`;
    }

    public get(id: SealedId): Readonly<T> | undefined {
        return this.read()[id];
    }

    public save(id: SealedId, value: Readonly<T>): void {
        this.write({ ...this.read(), [id]: value });
    }

    public remove(id: SealedId): void {
        const { [id]: removed, ...values } = this.read();

        if (removed !== undefined) {
            this.write(values);
        }
    }

    private read(): Readonly<Record<SealedId, Readonly<T>>> {
        try {
            return JSON.parse(this.storage().getItem(this.key) ?? '{}');
        } catch (error: unknown) {
            TimedLogger.warn('The committed actions can not be read, a reload can not reveal them', error);
            return {};
        }
    }

    private write(values: Readonly<Record<SealedId, Readonly<T>>>): void {
        try {
            this.storage().setItem(this.key, JSON.stringify(values));
        } catch (error: unknown) {
            // Private browsing or blocked site data: a reload loses the value committed to
            TimedLogger.warn('The committed actions can not be stored, a reload can not reveal them', error);
        }
    }
}
