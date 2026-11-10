import { CHAT_MESSAGE_MAX_LENGTH, ChatText, isChatText, LATEST_TIME } from '@app/modules/chat-page/components/chat/chat.component';
import { BlockChainRouting } from '@app/services/room-manager/classes/room/block-room/block-room';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { PLAYER_NAME_MAX_LENGTH } from '@protocol/room-limits';

export enum PrivateMessengerType {
    /** The public key of agreement of a participant: the messages sent to it are encrypted for the latest one it published */
    KEY = 'PV_key',
    /** A message of a private conversation, encrypted to each of its recipients */
    MESSAGE = 'PV_message',
    /** A message of a watched conversation, in clear text: every participant reads it */
    WATCHED = 'PV_watched',
}

/** A public key of agreement, ECDH on P-384: the fields of its JSON Web Key telling its point, nothing else */
export interface PrivatePublicKey {
    readonly kty: 'EC';
    readonly crv: 'P-384';
    readonly x: string;
    readonly y: string;
}

export interface PrivateKeyPayload {
    readonly key: Readonly<PrivatePublicKey>;
}

/** The copy of a message for one recipient, readable with its key only */
export interface SealedPart {
    readonly to: string;
    /** The id of the key of the recipient it is encrypted for */
    readonly key: string;
    /** The initialization vector of AES-GCM, in base64 */
    readonly iv: string;
    /** The text encrypted, followed by its tag, in base64 */
    readonly data: string;
}

/**
 * A message of a conversation: a part for each recipient, its sender included, which reads its own messages again after a
 * reload. Who writes to whom, when and how long the text roughly is are seen by every participant
 */
export interface PrivateEnvelope {
    readonly conversation: string;
    /** The id its sender gave it, the same when sent again */
    readonly id: string;
    /** The id of the key of its sender */
    readonly key: string;
    readonly parts: ReadonlyArray<Readonly<SealedPart>>;
}

/** A message of a watched conversation: its text, read by every participant, written by a member */
export interface WatchedText extends ChatText {
    readonly conversation: string;
}

export interface PrivatePayloads {
    [PrivateMessengerType.KEY]: PrivateKeyPayload;
    [PrivateMessengerType.MESSAGE]: PrivateEnvelope;
    [PrivateMessengerType.WATCHED]: WatchedText;
}

export type PrivateMessage = {
    [Type in keyof PrivatePayloads]: AppMessage<Type, PrivatePayloads[Type]>;
}[keyof PrivatePayloads];

// The private conversations have their own block chain: their messages never delay the moves of the game. The watched
// ones travel on the chain of the chat, in the order of its moderation: a mute reaches the messages ordered after it
export const privateBlockChains: BlockChainRouting<PrivatePayloads> = {
    [PrivateMessengerType.KEY]: BlockChainName.PRIVATE,
    [PrivateMessengerType.MESSAGE]: BlockChainName.PRIVATE,
    [PrivateMessengerType.WATCHED]: BlockChainName.CHAT,
};

/** The members of a conversation at most: the players of a room */
export const PRIVATE_MAX_MEMBERS: number = 8;
/** The id of a conversation, unique in the room: an id of the DOM too */
export const CONVERSATION_ID: RegExp = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** The text encrypted is padded to a multiple of these bytes: its length shows to the nearest block only */
export const PRIVATE_PADDING_BLOCK: number = 256;
/** The bytes of the tag of AES-GCM, after the text encrypted */
export const PRIVATE_TAG_LENGTH: number = 16;
/** The bytes of the initialization vector of AES-GCM */
export const PRIVATE_IV_LENGTH: number = 12;

// The longest text encrypted: the time it was written at, a new line, then the longest message, 3 bytes of UTF-8 at most
// by character of JavaScript (a pair of them giving 4 bytes), then the first byte of the padding
const PLAINTEXT_MAX_BYTES: number = String(-LATEST_TIME).length + 1 + 3 * CHAT_MESSAGE_MAX_LENGTH + 1;
const SEALED_MAX_BYTES: number = Math.ceil(PLAINTEXT_MAX_BYTES / PRIVATE_PADDING_BLOCK) * PRIVATE_PADDING_BLOCK + PRIVATE_TAG_LENGTH;
/** The longest data of a part, in base64: the longest message of the chat, encrypted */
export const PRIVATE_SEALED_MAX_LENGTH: number = 4 * Math.ceil(SEALED_MAX_BYTES / 3);

// A coordinate of a point of P-384: 48 bytes in base64url, without padding
const COORDINATE: RegExp = /^[\w-]{64}$/;
// The SHA-256 digest of a key, see keyIdOf
const KEY_ID: RegExp = /^[0-9a-f]{64}$/;
// The id of a message, as crypto.randomUUID() draws it
const MESSAGE_ID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// 12 bytes in base64, without padding
const IV: RegExp = /^[A-Za-z0-9+/]{16}$/;
const BASE64: RegExp = /^[A-Za-z0-9+/]+={0,2}$/;

type Fields = Readonly<Record<string, unknown>>;

/** An object holding these fields and no other one */
function hasFields(value: unknown, names: ReadonlyArray<string>): value is Fields {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const keys: ReadonlyArray<string> = Object.keys(value);
    return keys.length === names.length && names.every((name: string) => keys.includes(name));
}

function matches(value: unknown, pattern: RegExp): boolean {
    return typeof value === 'string' && pattern.test(value);
}

/** The id of a key of agreement, as {@link keyIdOf} gives it */
export function isKeyId(value: unknown): value is string {
    return matches(value, KEY_ID);
}

/** A public key of agreement from a peer: the fields of its point only, the curve of the application */
export function isPrivateKeyPayload(payload: unknown): payload is PrivateKeyPayload {
    if (!hasFields(payload, ['key']) || !hasFields(payload['key'], ['kty', 'crv', 'x', 'y'])) {
        return false;
    }
    const key: Fields = payload['key'];
    return key['kty'] === 'EC' && key['crv'] === 'P-384' && matches(key['x'], COORDINATE) && matches(key['y'], COORDINATE);
}

function isRecipient(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= PLAYER_NAME_MAX_LENGTH;
}

function isSealedPart(part: unknown): part is SealedPart {
    return hasFields(part, ['to', 'key', 'iv', 'data']) && isRecipient(part['to']) && isKeyId(part['key']) && matches(part['iv'], IV)
        && matches(part['data'], BASE64) && (part['data'] as string).length <= PRIVATE_SEALED_MAX_LENGTH;
}

/**
 * A message of a conversation from a peer, of the form the application sends: a part for each recipient, one at most,
 * each one no longer than the longest message of the chat encrypted. Its parts are read by their recipients only
 */
export function isPrivateEnvelope(payload: unknown): payload is PrivateEnvelope {
    if (!hasFields(payload, ['conversation', 'id', 'key', 'parts']) || !matches(payload['conversation'], CONVERSATION_ID)
        || !matches(payload['id'], MESSAGE_ID) || !isKeyId(payload['key'])) {
        return false;
    }
    const parts: unknown = payload['parts'];
    return Array.isArray(parts) && parts.length > 0 && parts.length <= PRIVATE_MAX_MEMBERS && parts.every(isSealedPart)
        && new Set(parts.map((part: SealedPart) => part.to)).size === parts.length;
}

/**
 * A message of a watched conversation from a peer, of the form the application sends: a text of the chat, checked by
 * every page, no link included
 */
export function isWatchedText(payload: unknown): payload is WatchedText {
    return hasFields(payload, ['conversation', 'id', 'at', 'text']) && matches(payload['conversation'], CONVERSATION_ID) && matches(payload['id'], MESSAGE_ID)
        && isChatText(payload);
}
