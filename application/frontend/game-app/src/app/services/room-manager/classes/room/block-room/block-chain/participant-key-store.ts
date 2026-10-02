import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { keyPairAlgorithm } from './block-chain.constants';

/**
 * Keeps the key pair of each player name in the browser: a player reloading the page keeps its identity,
 * so the blocks it signed before stay verifiable by the other players.
 * The private key is not extractable, it can only be used to sign.
 */
export class ParticipantKeyStore {
    private static readonly DATABASE: string = 'synchronous-chess';
    private static readonly STORE: string = 'participant-keys';

    public static async generateKeyPair(): Promise<CryptoKeyPair> {
        // The public key of a pair is always extractable, to be sent to the other players
        return await crypto.subtle.generateKey(keyPairAlgorithm, false, ['sign', 'verify']);
    }

    /**
     * @param factory the IndexedDB of the browser, missing when the storage is not available
     */
    public constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

    /** The stored key pair of the player, created on its first use */
    public async keyPairOf(playerName: string): Promise<CryptoKeyPair> {
        // Created first: the key generation can not happen inside the transaction, which would end meanwhile
        const keyPair: CryptoKeyPair = await ParticipantKeyStore.generateKeyPair();

        try {
            return await this.storeOnce(playerName, keyPair);
        } catch (error: unknown) {
            // Private browsing or blocked site data: the identity only lasts until the page is reloaded
            TimedLogger.warn('The key pair can not be stored, a reload will change the identity of the player', error);
            return keyPair;
        }
    }

    /** In a single transaction, so that two pages of the same player end up with the same key pair */
    private async storeOnce(playerName: string, keyPair: CryptoKeyPair): Promise<CryptoKeyPair> {
        const database: IDBDatabase = await this.open();

        try {
            const store: IDBObjectStore = database.transaction(ParticipantKeyStore.STORE, 'readwrite').objectStore(ParticipantKeyStore.STORE);
            const stored: CryptoKeyPair | undefined = await ParticipantKeyStore.result<CryptoKeyPair | undefined>(store.get(playerName));

            if (stored) {
                return stored;
            }

            await ParticipantKeyStore.result(store.add(keyPair, playerName));
            return keyPair;
        } finally {
            database.close();
        }
    }

    private async open(): Promise<IDBDatabase> {
        if (!this.factory) {
            throw new Error('IndexedDB is not available');
        }

        const request: IDBOpenDBRequest = this.factory.open(ParticipantKeyStore.DATABASE, 1);
        request.onupgradeneeded = (): void => {
            request.result.createObjectStore(ParticipantKeyStore.STORE);
        };

        return await ParticipantKeyStore.result(request);
    }

    private static async result<T>(request: IDBRequest<T>): Promise<T> {
        return await new Promise<T>((resolve, reject) => {
            request.onsuccess = (): void => resolve(request.result);
            request.onerror = (): void => reject(request.error);
        });
    }
}
