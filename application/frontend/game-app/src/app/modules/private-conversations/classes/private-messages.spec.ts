import { CryptoHelper } from '@app/helpers/crypto.helper';
import { CHAT_MESSAGE_MAX_LENGTH } from '@app/modules/chat-page/components/chat/chat.component';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { ParticipantKeyStore } from '@app/services/room-manager/classes/room/block-room/block-chain/participant-key-store';
import { describe, expect, test } from 'vitest';
import { exportAgreementKey, keyIdOf, pairKey, importAgreementKey, seal, open } from './private-crypto';
import {
    CONVERSATION_ID,
    isKeyId,
    isPrivateEnvelope,
    isPrivateKeyPayload,
    isWatchedText,
    PRIVATE_SEALED_MAX_LENGTH,
    privateBlockChains,
    PrivateEnvelope,
    PrivateMessengerType,
    SealedPart,
    WatchedText
} from './private-messages';

const KEY_ID: string = 'a'.repeat(64);
const COORDINATE: string = `${ 'A'.repeat(62) }-_`;
const PART: SealedPart = { to: 'bob', key: KEY_ID, iv: 'AAAAAAAAAAAAAAAA', data: 'AAAA' };
const ENVELOPE: PrivateEnvelope = { conversation: 'cb-1-0-north', id: '0b6c7d4e-1f2a-4b3c-8d9e-0a1b2c3d4e5f', key: KEY_ID, parts: [PART] };
const WATCHED: WatchedText = { conversation: 'fr-1-0', id: '0b6c7d4e-1f2a-4b3c-8d9e-0a1b2c3d4e5f', at: 1, text: 'the ball is on 3' };

describe('private messages', () => {
    test('should carry the keys and the messages on the private chain, the watched ones on the chain of the chat', () => {
        expect(privateBlockChains).toEqual({
            [PrivateMessengerType.KEY]: BlockChainName.PRIVATE,
            [PrivateMessengerType.MESSAGE]: BlockChainName.PRIVATE,
            [PrivateMessengerType.WATCHED]: BlockChainName.CHAT,
        });
    });

    test.each<[string, boolean]>([
        ['cb-0-1-customs-12', true],
        ['a', true],
        [`a${ '-'.repeat(63) }`, true],
        [`a${ '-'.repeat(64) }`, false],
        ['-team', false],
        ['Team', false],
        ['team north', false],
        ['', false],
    ])('should take %j as the id of a conversation: %s', (id: string, valid: boolean) => {
        expect(CONVERSATION_ID.test(id)).toBe(valid);
    });

    test('should tell the id of a key', () => {
        expect(isKeyId(KEY_ID)).toBe(true);
        expect(isKeyId('A'.repeat(64))).toBe(false);
        expect(isKeyId(1)).toBe(false);
    });

    test('should accept a public key of the form the application sends', () => {
        expect(isPrivateKeyPayload({ key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: COORDINATE } })).toBe(true);
    });

    test.each<[string, unknown]>([
        ['no object', 'key'],
        ['null', null],
        ['an array', [COORDINATE]],
        ['another field', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: COORDINATE }, name: 'bob' }],
        ['the private part of the key', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: COORDINATE, d: COORDINATE } }],
        ['the fields of the export', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: COORDINATE, ext: true, key_ops: [] } }],
        ['another type of key', { key: { kty: 'RSA', crv: 'P-384', x: COORDINATE, y: COORDINATE } }],
        ['another curve', { key: { kty: 'EC', crv: 'P-256', x: COORDINATE, y: COORDINATE } }],
        ['a short coordinate', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE.slice(1), y: COORDINATE } }],
        ['a coordinate in base64', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: `${ 'A'.repeat(62) }+/` } }],
        ['a coordinate not a text', { key: { kty: 'EC', crv: 'P-384', x: COORDINATE, y: 1 } }],
    ])('should refuse a public key with %s', (_: string, payload: unknown) => {
        expect(isPrivateKeyPayload(payload)).toBe(false);
    });

    test('should accept an envelope of the form the application sends', () => {
        expect(isPrivateEnvelope(ENVELOPE)).toBe(true);
        expect(isPrivateEnvelope({ ...ENVELOPE, parts: Array.from({ length: 8 }, (_: unknown, index: number) => ({ ...PART, to: `p${ index }` })) })).toBe(true);
    });

    test.each<[string, unknown]>([
        ['no object', undefined],
        ['another field', { ...ENVELOPE, at: 1 }],
        ['an invalid conversation', { ...ENVELOPE, conversation: 'North' }],
        ['an id not drawn', { ...ENVELOPE, id: 'message-1' }],
        ['an invalid key', { ...ENVELOPE, key: 'key' }],
        ['parts not a list', { ...ENVELOPE, parts: PART }],
        ['no part', { ...ENVELOPE, parts: [] }],
        ['too many parts', { ...ENVELOPE, parts: Array.from({ length: 9 }, (_: unknown, index: number) => ({ ...PART, to: `p${ index }` })) }],
        ['two parts for a recipient', { ...ENVELOPE, parts: [PART, { ...PART, key: 'b'.repeat(64) }] }],
        ['a part with another field', { ...ENVELOPE, parts: [{ ...PART, at: 1 }] }],
        ['a part without recipient', { ...ENVELOPE, parts: [{ ...PART, to: '' }] }],
        ['a part for a name too long', { ...ENVELOPE, parts: [{ ...PART, to: 'b'.repeat(33) }] }],
        ['a part for a recipient not named', { ...ENVELOPE, parts: [{ ...PART, to: 1 }] }],
        ['a part with an invalid key', { ...ENVELOPE, parts: [{ ...PART, key: 'key' }] }],
        ['a part with a short vector', { ...ENVELOPE, parts: [{ ...PART, iv: 'AAAA' }] }],
        ['a part with data not in base64', { ...ENVELOPE, parts: [{ ...PART, data: 'AA-_' }] }],
        ['a part with data too long', { ...ENVELOPE, parts: [{ ...PART, data: 'A'.repeat(PRIVATE_SEALED_MAX_LENGTH + 1) }] }],
    ])('should refuse an envelope with %s', (_: string, payload: unknown) => {
        expect(isPrivateEnvelope(payload)).toBe(false);
    });

    test('should accept a watched message of the form the application sends', () => {
        expect(isWatchedText(WATCHED)).toBe(true);
        expect(isWatchedText({ ...WATCHED, text: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH) })).toBe(true);
    });

    test.each<[string, unknown]>([
        ['no object', null],
        ['a list', [WATCHED]],
        ['another field', { ...WATCHED, key: KEY_ID }],
        ['a missing field', { conversation: WATCHED.conversation, id: WATCHED.id, text: WATCHED.text }],
        ['an invalid conversation', { ...WATCHED, conversation: 'Talk' }],
        ['an id not drawn', { ...WATCHED, id: 'message-1' }],
        ['a blank text', { ...WATCHED, text: '  ' }],
        ['a text too long', { ...WATCHED, text: 'a'.repeat(CHAT_MESSAGE_MAX_LENGTH + 1) }],
        ['a link', { ...WATCHED, text: 'see example.com' }],
        ['a time out of range', { ...WATCHED, at: Number.MAX_SAFE_INTEGER }],
    ])('should refuse a watched message with %s', (_: string, payload: unknown) => {
        expect(isWatchedText(payload)).toBe(false);
    });

    test.each<[string, string, number]>([
        ['3 bytes', '€', 3000],
        ['4 bytes by pair', '😀', 2000],
    ])('should accept the longest message of the chat encrypted, of characters of %s', async (_: string, character: string, bytes: number) => {
        // Given
        const pair: CryptoKeyPair = await ParticipantKeyStore.generateAgreementKeyPair();
        const keyId: string = await keyIdOf(await exportAgreementKey(pair.publicKey));
        const key: CryptoKey = await pairKey(pair.privateKey, await importAgreementKey(await exportAgreementKey(pair.publicKey)), 'room', [keyId, keyId]);
        const text: string = character.repeat(CHAT_MESSAGE_MAX_LENGTH / character.length);
        const context = { room: 'room', conversation: 'team', id: ENVELOPE.id, from: 'bob', fromKey: keyId, to: 'bob', toKey: keyId };

        // When
        const sealed = await seal(key, { at: -8.64e15, text }, context);

        // Then
        expect(text).toHaveLength(CHAT_MESSAGE_MAX_LENGTH);
        expect(isPrivateEnvelope({ ...ENVELOPE, key: keyId, parts: [{ ...sealed, to: 'bob', key: keyId }] })).toBe(true);
        expect(CryptoHelper.fromBase64(sealed.data).length).toBeGreaterThan(bytes);
        expect((await open(key, sealed, context)).text).toEqual(text);
    });
});
