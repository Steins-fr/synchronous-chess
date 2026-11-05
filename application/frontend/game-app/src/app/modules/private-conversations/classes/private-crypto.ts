import { CryptoHelper } from '@app/helpers/crypto.helper';
import { agreementAlgorithm } from '@app/services/room-manager/classes/room/block-room/block-chain/block-chain.constants';
import { PRIVATE_IV_LENGTH, PRIVATE_PADDING_BLOCK, PrivatePublicKey, SealedPart } from './private-messages';

/** Bound to every key and every text encrypted: another version of the format never reads them */
const VERSION: string = 'synchronous-chess/private/v1';
// The first byte of the padding of ISO/IEC 7816-4, the next ones being 0
const PADDING_START: number = 0x80;
// The length of a digest of SHA-384, in bytes: the bits derived from two keys
const SHARED_BITS: number = 384;

/** What a part is bound to: read in another room, conversation or message, or by another key, it does not decrypt */
export interface SealContext {
    readonly room: string;
    readonly conversation: string;
    /** The id of the message */
    readonly id: string;
    readonly from: string;
    /** The id of the key of the sender */
    readonly fromKey: string;
    readonly to: string;
    /** The id of the key of the recipient */
    readonly toKey: string;
}

/** A message as encrypted: the time its sender wrote it, by its clock, and its text */
export interface PrivateText {
    readonly at: number;
    readonly text: string;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);
// The time a message was written at, then its text
const PRIVATE_TEXT: RegExp = /^(-?\d{1,16})\n([\s\S]*)$/;

/** The id of a public key of agreement: the SHA-256 digest of its point, the same on every page */
export async function keyIdOf(key: Readonly<PrivatePublicKey>): Promise<string> {
    return await CryptoHelper.sha256(JSON.stringify([key.crv, key.kty, key.x, key.y]));
}

/** The public key of a key pair of agreement, as published: the fields of its point, without the ones the export adds */
export async function exportAgreementKey(publicKey: CryptoKey): Promise<PrivatePublicKey> {
    const jwk: JsonWebKey = await crypto.subtle.exportKey('jwk', publicKey);
    return { kty: jwk.kty as 'EC', crv: jwk.crv as 'P-384', x: jwk.x as string, y: jwk.y as string };
}

/**
 * The public key of agreement of a participant
 * @throws Error when its point is not on the curve
 */
export async function importAgreementKey(key: Readonly<PrivatePublicKey>): Promise<CryptoKey> {
    return await crypto.subtle.importKey('jwk', { kty: key.kty, crv: key.crv, x: key.x, y: key.y }, agreementAlgorithm, true, []);
}

/**
 * The key two participants share in a room, the same for both of them: the bits of ECDH, through HKDF, give a key of
 * AES-GCM bound to the version, the room and both keys. A participant shares one with itself, for its own copies
 * @param keyIds the ids of the public keys of both participants, in any order
 */
export async function pairKey(privateKey: CryptoKey, publicKey: CryptoKey, room: string, keyIds: readonly [string, string]): Promise<CryptoKey> {
    const bits: ArrayBuffer = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, SHARED_BITS);
    const material: CryptoKey = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const [first, second] = keyIds;
    const sorted: ReadonlyArray<string> = first < second ? [first, second] : [second, first];

    return await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-384',
            // A salt of zeros, as RFC 5869 gives when none is: the bits of ECDH are already secret and uniform enough, and
            // both participants derive the key apart, with nothing random to share. Not a password hashed
            salt: new Uint8Array(SHARED_BITS / 8),
            info: utf8(JSON.stringify([VERSION, room, ...sorted])),
        },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** The bytes padded as ISO/IEC 7816-4 does: a byte 0x80, then zeros up to a multiple of the block */
export function pad(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    const padded = new Uint8Array(Math.ceil((bytes.length + 1) / PRIVATE_PADDING_BLOCK) * PRIVATE_PADDING_BLOCK);
    padded.set(bytes);
    padded[bytes.length] = PADDING_START;
    return padded;
}

/**
 * The bytes of a padded text, without their padding
 * @throws Error when the padding is not the one {@link pad} adds
 */
export function unpad(padded: Uint8Array): Uint8Array {
    let start: number = padded.length - 1;
    while (start >= 0 && padded[start] === 0) {
        start--;
    }
    if (padded.length % PRIVATE_PADDING_BLOCK !== 0 || padded[start] !== PADDING_START || padded.length - start > PRIVATE_PADDING_BLOCK) {
        throw new Error('Invalid padding');
    }
    return padded.subarray(0, start);
}

function additionalData(context: Readonly<SealContext>): Uint8Array<ArrayBuffer> {
    return utf8(JSON.stringify([VERSION, context.room, context.conversation, context.id, context.from, context.fromKey, context.to, context.toKey]));
}

/** Encrypts a message for a recipient, with an initialization vector drawn for it */
export async function seal(key: CryptoKey, message: Readonly<PrivateText>, context: Readonly<SealContext>): Promise<Pick<SealedPart, 'iv' | 'data'>> {
    const iv: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(PRIVATE_IV_LENGTH));
    const data: ArrayBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: additionalData(context) }, key, pad(utf8(`${ message.at }\n${ message.text }`)),
    );
    return { iv: CryptoHelper.toBase64(iv), data: CryptoHelper.toBase64(new Uint8Array(data)) };
}

/**
 * Decrypts the part of a recipient
 * @throws Error when it was not encrypted with this key, for this context, or not as {@link seal} does
 */
export async function open(key: CryptoKey, part: Pick<SealedPart, 'iv' | 'data'>, context: Readonly<SealContext>): Promise<PrivateText> {
    const padded: ArrayBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: CryptoHelper.fromBase64(part.iv) as Uint8Array<ArrayBuffer>, additionalData: additionalData(context) },
        key,
        CryptoHelper.fromBase64(part.data) as Uint8Array<ArrayBuffer>,
    );
    const plaintext: string = new TextDecoder('utf-8', { fatal: true }).decode(unpad(new Uint8Array(padded)));
    const parsed: RegExpExecArray | null = PRIVATE_TEXT.exec(plaintext);

    if (parsed === null) {
        throw new Error('Invalid private text');
    }
    return { at: Number(parsed[1]), text: parsed[2] };
}
