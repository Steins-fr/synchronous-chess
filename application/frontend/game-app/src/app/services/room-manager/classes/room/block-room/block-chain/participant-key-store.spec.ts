import { ParticipantKeyStore } from './participant-key-store';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { TestHelper } from '@testing/test.helper';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

async function publicJwk(keyPair: CryptoKeyPair): Promise<JsonWebKey> {
    return await crypto.subtle.exportKey('jwk', keyPair.publicKey);
}

describe('ParticipantKeyStore', () => {
    let factory: IDBFactory;

    beforeEach(() => {
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        factory = new IDBFactory();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('generateKeyPair should create a key pair whose private key can only sign', async () => {
        // When
        const keyPair: CryptoKeyPair = await ParticipantKeyStore.generateKeyPair();

        // Then
        expect(keyPair.privateKey.extractable).toEqual(false);
        expect(keyPair.privateKey.usages).toEqual(['sign']);
        expect(keyPair.publicKey.extractable).toEqual(true);
    });

    test('should keep the key pair of a player across the pages', async () => {
        // Given
        const first: CryptoKeyPair = await new ParticipantKeyStore(factory).keyPairOf('a');

        // When
        const again: CryptoKeyPair = await new ParticipantKeyStore(factory).keyPairOf('a');
        const other: CryptoKeyPair = await new ParticipantKeyStore(factory).keyPairOf('b');

        // Then
        expect(await publicJwk(again)).toEqual(await publicJwk(first));
        expect(await publicJwk(other)).not.toEqual(await publicJwk(first));
        expect(again.privateKey.extractable).toEqual(false);
    });

    test('should give the same key pair to the pages of a player opened at the same time', async () => {
        // When
        const [first, second] = await Promise.all([
            new ParticipantKeyStore(factory).keyPairOf('a'),
            new ParticipantKeyStore(factory).keyPairOf('a'),
        ]);

        // Then
        expect(await publicJwk(second)).toEqual(await publicJwk(first));
    });

    test('should fall back to a key pair for the page without storage', async () => {
        // When
        const first: CryptoKeyPair = await new ParticipantKeyStore(undefined).keyPairOf('a');
        const again: CryptoKeyPair = await new ParticipantKeyStore(undefined).keyPairOf('a');

        // Then
        expect(await publicJwk(again)).not.toEqual(await publicJwk(first));
        expect(TimedLogger.warn).toHaveBeenCalledWith('The key pair can not be stored, a reload will change the identity of the player', expect.any(Error));
    });

    test('should fall back to a key pair for the page when the storage fails', async () => {
        // Given
        const failingFactory = TestHelper.cast<IDBFactory>({
            open: (): IDBOpenDBRequest => {
                const request = TestHelper.cast<IDBOpenDBRequest & { error: Error }>({ error: new Error('blocked') });
                setTimeout(() => request.onerror?.(TestHelper.cast<Event>({})));
                return request;
            },
        });

        // When
        const keyPair: CryptoKeyPair = await new ParticipantKeyStore(failingFactory).keyPairOf('a');

        // Then
        expect(keyPair.privateKey.usages).toEqual(['sign']);
        expect(TimedLogger.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'IndexedDB request failed', cause: new Error('blocked') }));
    });

    test('generateAgreementKeyPair should create a key pair whose private key can only derive the shared keys', async () => {
        // When
        const keyPair: CryptoKeyPair = await ParticipantKeyStore.generateAgreementKeyPair();

        // Then
        expect(keyPair.privateKey.algorithm).toEqual({ name: 'ECDH', namedCurve: 'P-384' });
        expect(keyPair.privateKey.extractable).toEqual(false);
        expect(keyPair.privateKey.usages).toEqual(['deriveBits']);
        expect(keyPair.publicKey.extractable).toEqual(true);
    });

    test('should keep the key pair of agreement of a player across the pages, apart from its identity', async () => {
        // Given
        const identity: CryptoKeyPair = await new ParticipantKeyStore(factory).keyPairOf('a');
        const first: CryptoKeyPair = await new ParticipantKeyStore(factory).agreementKeyPairOf('a');

        // When
        const again: CryptoKeyPair = await new ParticipantKeyStore(factory).agreementKeyPairOf('a');
        const other: CryptoKeyPair = await new ParticipantKeyStore(factory).agreementKeyPairOf('b');
        const identityAgain: CryptoKeyPair = await new ParticipantKeyStore(factory).keyPairOf('a');

        // Then
        expect(await publicJwk(again)).toEqual(await publicJwk(first));
        expect(await publicJwk(other)).not.toEqual(await publicJwk(first));
        expect(again.privateKey.extractable).toEqual(false);
        expect(again.privateKey.usages).toEqual(['deriveBits']);
        expect((await publicJwk(first)).x).not.toEqual((await publicJwk(identity)).x);
        expect(await publicJwk(identityAgain)).toEqual(await publicJwk(identity));
        expect(identityAgain.privateKey.usages).toEqual(['sign']);
    });

    test('should store the key pair of agreement under an array key, in the store of the identities', async () => {
        // Given
        const keyPair: CryptoKeyPair = await new ParticipantKeyStore(factory).agreementKeyPairOf('a');

        // When
        const keys: ReadonlyArray<IDBValidKey> = await new Promise((resolve, reject) => {
            const request: IDBOpenDBRequest = factory.open('synchronous-chess', 1);
            request.onerror = (): void => reject(new Error('open failed'));
            request.onsuccess = (): void => {
                const keysRequest: IDBRequest<IDBValidKey[]> = request.result.transaction('participant-keys').objectStore('participant-keys').getAllKeys();
                keysRequest.onsuccess = (): void => {
                    request.result.close();
                    resolve(keysRequest.result);
                };
            };
        });

        // Then
        expect(keys).toEqual([['agreement', 'a']]);
        expect(keyPair.privateKey.usages).toEqual(['deriveBits']);
    });

    test('should give the same key pair of agreement to the pages of a player opened at the same time', async () => {
        // When
        const [first, second] = await Promise.all([
            new ParticipantKeyStore(factory).agreementKeyPairOf('a'),
            new ParticipantKeyStore(factory).agreementKeyPairOf('a'),
        ]);

        // Then
        expect(await publicJwk(second)).toEqual(await publicJwk(first));
    });

    test('should fall back to a key pair of agreement for the page without storage', async () => {
        // When
        const first: CryptoKeyPair = await new ParticipantKeyStore(undefined).agreementKeyPairOf('a');
        const again: CryptoKeyPair = await new ParticipantKeyStore(undefined).agreementKeyPairOf('a');

        // Then
        expect(await publicJwk(again)).not.toEqual(await publicJwk(first));
        expect(first.privateKey.usages).toEqual(['deriveBits']);
        expect(TimedLogger.warn).toHaveBeenCalledWith('The key pair of agreement can not be stored, a reload will make the private messages unreadable', expect.any(Error));
    });

    test('should use the storage of the browser by default', () => {
        expect(TestHelper.cast<{ factory: unknown }>(new ParticipantKeyStore()).factory).toBe(globalThis.indexedDB);
    });
});
