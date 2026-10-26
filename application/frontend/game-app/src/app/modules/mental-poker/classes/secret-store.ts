import { TimedLogger } from '@app/helpers/timed-logger.helper';

/**
 * Keeps in the tab the secrets of the player for each game of a room (a deck, a cylinder), stored before it sends anything
 * made with them: once the page is reloaded, the player still plays with them. The secrets of a game are never drawn
 * again, what the chain holds being made with the first ones.
 */
export class SecretStore<T> {
    private readonly prefix: string;

    /**
     * @param kind what the secrets are of (`deck`, `cylinder`): in the keys of the storage and in the logs
     * @param storage the session storage of the browser, read on use: it throws when the storage is blocked
     */
    public constructor(
        private readonly kind: string,
        roomName: string,
        playerName: string,
        private readonly storage: () => Storage = () => globalThis.sessionStorage,
    ) {
        this.prefix = `synchronous-chess:${ kind }-keys:${ roomName }:${ playerName }`;
    }

    public get(game: string): Readonly<T> | undefined {
        try {
            const secrets: string | null = this.storage().getItem(this.key(game));
            return secrets === null ? undefined : JSON.parse(secrets);
        } catch (error: unknown) {
            TimedLogger.warn(`The keys of the ${ this.kind } can not be read: a reload loses them`, error);
            return undefined;
        }
    }

    public save(game: string, secrets: Readonly<T>): void {
        try {
            this.storage().setItem(this.key(game), JSON.stringify(secrets));
        } catch (error: unknown) {
            // Private browsing or blocked site data: the page keeps the secrets, a reload loses them
            TimedLogger.warn(`The keys of the ${ this.kind } can not be stored: a reload loses them`, error);
        }
    }

    /** Once disclosed, the secrets of a game are not secret anymore */
    public remove(game: string): void {
        try {
            this.storage().removeItem(this.key(game));
        } catch (error: unknown) {
            TimedLogger.warn(`The keys of the ${ this.kind } can not be removed`, error);
        }
    }

    private key(game: string): string {
        return `${ this.prefix }:${ game }`;
    }
}
