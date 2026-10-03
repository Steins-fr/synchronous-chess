import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { PieceColor } from '../../enums/piece-color.enum';
import type { SealedAction } from './synchronous-chess-online-game-session';

/** An action the local player committed to, with what it needs to reveal it */
export interface StoredTurn {
    turn: number;
    /** The colors playing the turn */
    colors: ReadonlyArray<PieceColor>;
    action: SealedAction;
    salt: string;
}

/**
 * Keeps in the tab the actions the player committed to and has not revealed yet, by turn: once the page is reloaded,
 * the player can still reveal them. A stored action is only used if it matches the commitment in the chain, so the
 * ones of a previous game in a room of the same name are ignored.
 */
export class SealedTurnStore {
    private static readonly PREFIX: string = 'synchronous-chess:sealed-turns';

    private readonly key: string;

    /**
     * @param storage the session storage of the browser, read on use: it throws when the storage is blocked
     */
    public constructor(
        roomName: string,
        playerName: string,
        private readonly storage: () => Storage = () => globalThis.sessionStorage,
    ) {
        this.key = `${ SealedTurnStore.PREFIX }:${ roomName }:${ playerName }`;
    }

    public get(turn: number): Readonly<StoredTurn> | undefined {
        return this.read()[turn];
    }

    public save(turn: Readonly<StoredTurn>): void {
        this.write({ ...this.read(), [turn.turn]: turn });
    }

    public remove(turn: number): void {
        const { [turn]: removed, ...turns } = this.read();

        if (removed) {
            this.write(turns);
        }
    }

    private read(): Readonly<Record<number, Readonly<StoredTurn>>> {
        try {
            return JSON.parse(this.storage().getItem(this.key) ?? '{}');
        } catch (error: unknown) {
            TimedLogger.warn('The committed actions can not be read, a reload can not reveal them', error);
            return {};
        }
    }

    private write(turns: Readonly<Record<number, Readonly<StoredTurn>>>): void {
        try {
            this.storage().setItem(this.key, JSON.stringify(turns));
        } catch (error: unknown) {
            // Private browsing or blocked site data: a reload loses the action committed to
            TimedLogger.warn('The committed actions can not be stored, a reload can not reveal them', error);
        }
    }
}
