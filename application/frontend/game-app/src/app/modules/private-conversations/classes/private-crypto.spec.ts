import { CryptoHelper } from '@app/helpers/crypto.helper';
import { ParticipantKeyStore } from '@app/services/room-manager/classes/room/block-room/block-chain/participant-key-store';
import { beforeAll, describe, expect, test } from 'vitest';
import { exportAgreementKey, importAgreementKey, keyIdOf, open, pad, pairKey, PrivateText, SealContext, seal, unpad } from './private-crypto';
import { isPrivateKeyPayload, PRIVATE_PADDING_BLOCK, PRIVATE_TAG_LENGTH, PrivatePublicKey, SealedPart } from './private-messages';

interface Holder {
    readonly pair: CryptoKeyPair;
    readonly key: PrivatePublicKey;
    readonly id: string;
    readonly imported: CryptoKey;
}

async function holder(): Promise<Holder> {
    const pair: CryptoKeyPair = await ParticipantKeyStore.generateAgreementKeyPair();
    const key: PrivatePublicKey = await exportAgreementKey(pair.publicKey);
    return { pair, key, id: await keyIdOf(key), imported: await importAgreementKey(key) };
}

const MESSAGE: PrivateText = { at: 1_700_000_000_000, text: 'I put 7\nin the trunk' };

describe('private crypto', () => {
    let alice: Holder;
    let bob: Holder;
    let carol: Holder;
    let context: SealContext;

    beforeAll(async () => {
        [alice, bob, carol] = await Promise.all([holder(), holder(), holder()]);
        context = { room: 'room', conversation: 'team', id: crypto.randomUUID(), from: 'alice', fromKey: alice.id, to: 'bob', toKey: bob.id };
    });

    const aliceToBob = (room: string = 'room'): Promise<CryptoKey> => pairKey(alice.pair.privateKey, bob.imported, room, [alice.id, bob.id]);
    const bobToAlice = (room: string = 'room'): Promise<CryptoKey> => pairKey(bob.pair.privateKey, alice.imported, room, [bob.id, alice.id]);

    test('should publish the point of a key only, of the form the peers accept', async () => {
        // Then
        expect(Object.keys(alice.key).sort()).toEqual(['crv', 'kty', 'x', 'y']);
        expect(isPrivateKeyPayload({ key: alice.key })).toBe(true);
    });

    test('should give a key the same id on every page, another one to another key', async () => {
        // When
        const again: string = await keyIdOf({ ...alice.key });

        // Then
        expect(again).toEqual(alice.id);
        expect(alice.id).toMatch(/^[0-9a-f]{64}$/);
        expect(bob.id).not.toEqual(alice.id);
    });

    test('should refuse a key whose point is not on the curve', async () => {
        // Given
        const coordinate: string = CryptoHelper.toBase64(new Uint8Array(48).fill(1)).replaceAll('+', '-').replaceAll('/', '_');

        // When
        const importing: Promise<CryptoKey> = importAgreementKey({ kty: 'EC', crv: 'P-384', x: coordinate, y: coordinate });

        // Then
        await expect(importing).rejects.toThrow();
    });

    test('should give both participants the same key, which a third one does not have', async () => {
        // Given
        const sealed: Pick<SealedPart, 'iv' | 'data'> = await seal(await aliceToBob(), MESSAGE, context);

        // When
        const read: PrivateText = await open(await bobToAlice(), sealed, context);
        const carolKey: CryptoKey = await pairKey(carol.pair.privateKey, alice.imported, 'room', [carol.id, alice.id]);

        // Then
        expect(read).toEqual(MESSAGE);
        await expect(open(carolKey, sealed, context)).rejects.toThrow();
    });

    test('should share a key with itself, for the copy of the sender', async () => {
        // Given
        const self: CryptoKey = await pairKey(alice.pair.privateKey, alice.imported, 'room', [alice.id, alice.id]);
        const selfContext: SealContext = { ...context, to: 'alice', toKey: alice.id };

        // When
        const read: PrivateText = await open(self, await seal(self, MESSAGE, selfContext), selfContext);

        // Then
        expect(read).toEqual(MESSAGE);
    });

    test.each<[string, Partial<SealContext>]>([
        ['conversation', { conversation: 'customs-1' }],
        ['message', { id: crypto.randomUUID() }],
        ['recipient', { to: 'carol' }],
        ['key of the recipient', { toKey: 'f'.repeat(64) }],
        ['sender', { from: 'carol' }],
        ['room', { room: 'other' }],
    ])('should not read a part in another %s', async (_: string, change: Partial<SealContext>) => {
        // Given
        const sealed: Pick<SealedPart, 'iv' | 'data'> = await seal(await aliceToBob(), MESSAGE, context);

        // When
        const reading: Promise<PrivateText> = open(await bobToAlice(), sealed, { ...context, ...change });

        // Then
        await expect(reading).rejects.toThrow();
    });

    test('should derive another key in another room', async () => {
        // Given
        const sealed: Pick<SealedPart, 'iv' | 'data'> = await seal(await aliceToBob('other'), MESSAGE, context);

        // When
        const reading: Promise<PrivateText> = open(await bobToAlice(), sealed, context);

        // Then
        await expect(reading).rejects.toThrow();
    });

    test('should not read a part altered', async () => {
        // Given
        const sealed: Pick<SealedPart, 'iv' | 'data'> = await seal(await aliceToBob(), MESSAGE, context);
        const bytes: Uint8Array = CryptoHelper.fromBase64(sealed.data);
        bytes[3] ^= 1;

        // When
        const reading: Promise<PrivateText> = open(await bobToAlice(), { ...sealed, data: CryptoHelper.toBase64(bytes) }, context);

        // Then
        await expect(reading).rejects.toThrow();
    });

    test('should draw an initialization vector for each part', async () => {
        // When
        const [first, second] = await Promise.all([seal(await aliceToBob(), MESSAGE, context), seal(await aliceToBob(), MESSAGE, context)]);

        // Then
        expect(CryptoHelper.fromBase64(first.iv)).toHaveLength(12);
        expect(second.iv).not.toEqual(first.iv);
        expect(second.data).not.toEqual(first.data);
    });

    test('should hide the length of the short texts: the same size for each one', async () => {
        // When
        const [short, longer] = await Promise.all([
            seal(await aliceToBob(), { at: MESSAGE.at, text: '7' }, context),
            seal(await aliceToBob(), { at: MESSAGE.at, text: 'I put 100 million in the trunk, believe me' }, context),
        ]);

        // Then
        expect(longer.data).toHaveLength(short.data.length);
        expect(CryptoHelper.fromBase64(short.data)).toHaveLength(PRIVATE_PADDING_BLOCK + PRIVATE_TAG_LENGTH);
    });

    test('should refuse a text without the time it was written at', async () => {
        // Given
        const key: CryptoKey = await aliceToBob();
        const sealed: Pick<SealedPart, 'iv' | 'data'> = await seal(key, { at: Number.NaN, text: 'hello' }, context);

        // When
        const reading: Promise<PrivateText> = open(key, sealed, context);

        // Then
        await expect(reading).rejects.toThrow('Invalid private text');
    });

    test.each<[number, number]>([
        [0, PRIVATE_PADDING_BLOCK],
        [PRIVATE_PADDING_BLOCK - 1, PRIVATE_PADDING_BLOCK],
        [PRIVATE_PADDING_BLOCK, 2 * PRIVATE_PADDING_BLOCK],
    ])('should pad %i bytes to %i, and remove the padding', (length: number, padded: number) => {
        // Given
        const bytes: Uint8Array = new Uint8Array(length).fill(0x80);

        // When
        const result: Uint8Array = pad(bytes);

        // Then
        expect(result).toHaveLength(padded);
        expect(result[length]).toEqual(0x80);
        expect(unpad(result)).toEqual(bytes);
    });

    test.each<[string, Uint8Array]>([
        ['no bytes', new Uint8Array(0)],
        ['bytes not a multiple of the block', new Uint8Array(PRIVATE_PADDING_BLOCK + 1).fill(0x80)],
        ['zeros only', new Uint8Array(PRIVATE_PADDING_BLOCK)],
        ['another byte before the zeros', Uint8Array.of(...new Uint8Array(PRIVATE_PADDING_BLOCK - 1).fill(0x80), 1)],
        ['a padding longer than a block', Uint8Array.of(0x80, ...new Uint8Array(2 * PRIVATE_PADDING_BLOCK - 1))],
    ])('should refuse a padding of %s', (_: string, padded: Uint8Array) => {
        expect(() => unpad(padded)).toThrow('Invalid padding');
    });
});
