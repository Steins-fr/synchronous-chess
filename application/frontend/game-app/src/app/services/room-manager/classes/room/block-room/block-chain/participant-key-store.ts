import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { agreementAlgorithm, keyPairAlgorithm } from './block-chain.constants';

/**
 * Keeps the key pairs of each player name in the browser: a player reloading the page keeps its identity,
 * so the blocks it signed before stay verifiable by the other players, and its key of agreement,
 * so it still reads the private messages sent to it.
 * The private keys are not extractable, they can only be used to sign or to derive the keys shared with the others.
 */
export class ParticipantKeyStore {
    private static readonly DATABASE: string = 'synchronous-chess';
    private static readonly STORE: string = 'participant-keys';
    /** The key of agreement of a player is stored under an array key, never equal to the name keeping its identity */
    private static readonly AGREEMENT: string = 'agreement';

    public static async generateKeyPair(): Promise<CryptoKeyPair> {
        // The public key of a pair is always extractable, to be sent to the other players
        return await crypto.subtle.generateKey(keyPairAlgorithm, false, ['sign', 'verify']);
    }

    public static async generateAgreementKeyPair(): Promise<CryptoKeyPair> {
        return await crypto.subtle.generateKey(agreementAlgorithm, false, ['deriveBits']);
    }

    /**
     * @param factory the IndexedDB of the browser, missing when the storage is not available
     */
    public constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

    /** The stored key pair of the player, created on its first use */
    public async keyPairOf(playerName: string): Promise<CryptoKeyPair> {
        return await this.pairOf(playerName, ParticipantKeyStore.generateKeyPair, 'The key pair can not be stored, a reload will change the identity of the player');
    }

    /** The stored key pair of agreement of the player, created on its first use */
    public async agreementKeyPairOf(playerName: string): Promise<CryptoKeyPair> {
        return await this.pairOf(
            [ParticipantKeyStore.AGREEMENT, playerName],
            ParticipantKeyStore.generateAgreementKeyPair,
            'The key pair of agreement can not be stored, a reload will make the private messages unreadable'
        );
    }

    private async pairOf(storageKey: IDBValidKey, generate: () => Promise<CryptoKeyPair>, warning: string): Promise<CryptoKeyPair> {
        try {
            // Created outside the transaction, which would end during the key generation
            return await this.stored(storageKey) ?? await this.storeOnce(storageKey, await generate());
        } catch (error: unknown) {
            // Private browsing or blocked site data: the pair only lasts until the page is reloaded
            TimedLogger.warn(warning, error);
            return await generate();
        }
    }

    private async stored(storageKey: IDBValidKey): Promise<CryptoKeyPair | undefined> {
        return await this.inStore('readonly', async (store: IDBObjectStore) => await ParticipantKeyStore.result<CryptoKeyPair | undefined>(store.get(storageKey)));
    }

    /** In a single transaction, so that two pages of the same player end up with the same key pair */
    private async storeOnce(storageKey: IDBValidKey, keyPair: CryptoKeyPair): Promise<CryptoKeyPair> {
        return await this.inStore('readwrite', async (store: IDBObjectStore) => {
            const stored: CryptoKeyPair | undefined = await ParticipantKeyStore.result<CryptoKeyPair | undefined>(store.get(storageKey));

            if (stored) {
                return stored;
            }

            await ParticipantKeyStore.result(store.add(keyPair, storageKey));
            return keyPair;
        });
    }

    private async inStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
        const database: IDBDatabase = await this.open();

        try {
            return await operation(database.transaction(ParticipantKeyStore.STORE, mode).objectStore(ParticipantKeyStore.STORE));
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
            request.onerror = (): void => reject(new Error('IndexedDB request failed', { cause: request.error }));
        });
    }
}
