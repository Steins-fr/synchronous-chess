import { Signal, signal } from '@angular/core';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { SecretStore } from './secret-store';

export interface KeptSecretsOptions<Stored, Secrets> {
    readonly store: SecretStore<Stored>;
    /** The id of the game in the store */
    readonly id: string;
    /** The secrets stored, as the game uses them: undefined, or thrown, for a storage that is not the one of this game */
    readonly parse: (stored: Readonly<Stored>) => Secrets | undefined;
    /** The warning once lost */
    readonly lostWarning: string;
    /** What the game drops once they are lost */
    readonly onLost?: () => void;
}

/**
 * The secrets of the local player in a game of the chain (a deck, a cylinder), stored in the tab before anything made
 * with them is sent: a reloaded page reads them again. Once lost, they are not looked for again
 */
export class KeptSecrets<Stored, Secrets> {
    private secrets?: Secrets;
    private readonly _lost = signal<boolean>(false);
    /** The page lost the secrets: it can not make the steps of the local player anymore */
    public readonly lost: Signal<boolean> = this._lost.asReadonly();

    public constructor(private readonly options: Readonly<KeptSecretsOptions<Stored, Secrets>>) {
    }

    /**
     * The secrets kept, else the ones stored
     * @param draw draws new ones when none is stored, stored before they are used
     */
    public load(draw?: () => Stored): Secrets | undefined {
        if (this.secrets || this._lost()) {
            return this.secrets;
        }

        const { store, id, parse } = this.options;
        let stored: Readonly<Stored> | undefined = store.get(id);

        if (!stored && draw) {
            stored = draw();
            store.save(id, stored);
        }

        try {
            this.secrets = stored === undefined ? undefined : parse(stored);
        } catch {
            // The storage of the tab is not the one of this game
            this.secrets = undefined;
        }

        if (!this.secrets) {
            this.lose();
        }
        return this.secrets;
    }

    /** New secrets of the local player: stored, and kept by the page too, a blocked storage losing them on a reload only */
    public keep(stored: Readonly<Stored>, secrets: Secrets): void {
        this.options.store.save(this.options.id, stored);
        this.secrets = secrets;
        this._lost.set(false);
    }

    /** The secrets kept are not the ones of the steps of the local player in the chain: dropped, they are lost */
    public drop(): void {
        this.secrets = undefined;
        this.options.store.remove(this.options.id);
        this.lose();
    }

    private lose(): void {
        this._lost.set(true);
        this.options.onLost?.();
        TimedLogger.warn(this.options.lostWarning);
    }
}
