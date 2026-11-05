import { computed, Signal, signal } from '@angular/core';
import { idGenerator } from '@app/helpers/id-generator.helper';
import { logHandlingFailure } from '@app/helpers/received-message-failure.helper';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { isChatText, SEND_TIMEOUT } from '@app/modules/chat-page/components/chat/chat.component';
import { admitChatMessage, CHAT_UNSENT_LIMIT, ChatAdmission, ChatFlood, NO_FLOOD, sendWaitUntil } from '@app/modules/chat-page/components/chat/chat-flood';
import { ChatEntryKind, ChatMessage, ChatMessageState } from '@app/modules/chat-page/components/chat/chat-message/chat-message.component';
import { Player } from '@app/services/room-manager/classes/player/player';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { ParticipantKeyStore } from '@app/services/room-manager/classes/room/block-room/block-chain/participant-key-store';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { merge, Subscription, timer } from 'rxjs';
import { PrivateConversation } from './private-conversation';
import { exportAgreementKey, importAgreementKey, keyIdOf, open, pairKey, PrivateText, seal } from './private-crypto';
import {
    CONVERSATION_ID,
    isPrivateEnvelope,
    isPrivateKeyPayload,
    PRIVATE_MAX_MEMBERS,
    PrivateEnvelope,
    PrivateKeyPayload,
    PrivateMessage,
    PrivateMessengerType,
    PrivatePayloads,
    PrivatePublicKey,
    SealedPart
} from './private-messages';

/** The keys a participant may publish, a key published again not counted: a few lost storages, not a flood of keys */
export const MAX_KEYS_PER_PARTICIPANT: number = 16;
/** The messages of conversations not declared yet a page keeps, the oldest dropped first: ids made up never are */
export const WAITING_MAX: number = 256;

export enum PrivateLineKind {
    MESSAGE = 'message',
    /** An author sending too many messages: they are hidden until its rate falls back */
    FLOOD = 'flood',
    /** A message the local player does not read: written for a key it lost, or while it was away, without a part for it */
    UNREADABLE = 'unreadable',
}

export interface PrivateMessageLine {
    readonly kind: PrivateLineKind.MESSAGE;
    readonly message: Readonly<ChatMessage>;
    /** Received as the chain orders it, not replayed: it may ring */
    readonly live: boolean;
}

export interface PrivateNoticeLine {
    readonly kind: PrivateLineKind.FLOOD | PrivateLineKind.UNREADABLE;
    readonly id: number;
    /** The author of the message */
    readonly name: string;
    /** When the chain ordered the message */
    readonly at: number;
    readonly live: boolean;
}

export type PrivateLine = PrivateMessageLine | PrivateNoticeLine;

/** A conversation of the local player, as it shows */
export interface PrivateConversationView extends PrivateConversation {
    readonly lines: ReadonlyArray<Readonly<PrivateLine>>;
    /** The members present, the local player included, whose key is not on the chain yet: the composer waits for them */
    readonly missingKeys: ReadonlyArray<string>;
}

/** Why the composer of a conversation does not send */
export enum PrivateComposerWait {
    /** The conversation is closed, or not one of the local player */
    CLOSED = 'closed',
    /** A member present, or the local player, has no key on the chain yet */
    KEYS = 'keys',
    /** The local player sent too many messages within the window of the rate */
    RATE = 'rate',
    /** Too many messages of the local player are not sent back yet */
    UNSENT = 'unsent',
}

export interface PrivateConversationsOptions {
    /** Where the key pair of agreement of the local player is kept, see ParticipantKeyStore */
    readonly keyStore?: ParticipantKeyStore;
}

type KeyMessage = AppMessage<PrivateMessengerType.KEY, PrivateKeyPayload>;
type EnvelopeMessage = AppMessage<PrivateMessengerType.MESSAGE, PrivateEnvelope>;

/** The key of agreement of the local player, for the page */
interface OwnKey {
    readonly pair: CryptoKeyPair;
    readonly key: PrivatePublicKey;
    readonly id: string;
}

/** An envelope checked by every page, waiting for its conversation to be declared */
interface ReceivedEnvelope {
    readonly message: EnvelopeMessage;
    readonly envelope: PrivateEnvelope;
    /** Within the rate of its author: it shows */
    readonly admitted: boolean;
    /** The first one hidden since the latest one shown of its author: the conversation tells it once */
    readonly notice: boolean;
    readonly live: boolean;
    readonly time: number;
}

const sameMembers = (members: ReadonlyArray<string>, others: ReadonlyArray<string>): boolean =>
    members.length === others.length && members.every((member: string) => others.includes(member));

/**
 * The private conversations a game declares, on the private chain: each participant member of one publishes its key of
 * agreement, and each message is encrypted to each member present, its sender included. Every page checks the form of
 * the messages, the keys they name and the rate of their authors, the same everywhere; once a conversation declared,
 * its members; its recipients alone read the texts, and check them. Not moderated: a participant removed from the room
 * stops sending
 */
export class PrivateConversations {
    private readonly keyStore: ParticipantKeyStore;
    private readonly _conversations = signal<ReadonlyArray<Readonly<PrivateConversation>>>([]);
    /** The conversations the game declared, the ones of the others included */
    public readonly conversations: Signal<ReadonlyArray<Readonly<PrivateConversation>>> = this._conversations.asReadonly();
    private readonly lines = signal<ReadonlyMap<string, ReadonlyArray<Readonly<PrivateLine>>>>(new Map());
    /** The latest key each participant published */
    private readonly currentKeys = signal<ReadonlyMap<string, string>>(new Map());
    private readonly ownKeyId = signal<string | undefined>(undefined);

    /** The conversations of the local player, in the order declared */
    public readonly mine: Signal<ReadonlyArray<Readonly<PrivateConversationView>>> = computed(() => {
        const me: string = this.room.localPlayer.name;
        const present = new Set<string>(this.room.players().map((player: Readonly<Player>) => player.name));
        const keys: ReadonlyMap<string, string> = this.currentKeys();
        const ownKeyId: string | undefined = this.ownKeyId();
        const lines: ReadonlyMap<string, ReadonlyArray<Readonly<PrivateLine>>> = this.lines();

        return this._conversations().filter((conversation: Readonly<PrivateConversation>) => conversation.members.includes(me))
            .map((conversation: Readonly<PrivateConversation>) => ({
                ...conversation,
                lines: lines.get(conversation.id) ?? [],
                missingKeys: conversation.members.filter((member: string) => member === me
                    ? ownKeyId === undefined || keys.get(me) !== ownKeyId
                    : present.has(member) && !keys.has(member)),
            }));
    });

    // The messages of the local player, in every conversation, the ones the room did not send back yet included
    private readonly ownMessages = computed<ReadonlyArray<Readonly<ChatMessage>>>(() => [...this.lines().values()].flat()
        .filter((line: Readonly<PrivateLine>): line is PrivateMessageLine => line.kind === PrivateLineKind.MESSAGE && line.message.isSelf)
        .map((line: PrivateMessageLine) => line.message));
    /**
     * Too many messages of the local player the room did not send back yet, in the conversations open, where they may be
     * sent again: the composer waits until it does
     */
    public readonly heldBack: Signal<boolean> = computed<boolean>(() => this.mine()
        .filter((conversation: Readonly<PrivateConversationView>) => conversation.open)
        .flatMap((conversation: Readonly<PrivateConversationView>) => conversation.lines)
        .filter((line: Readonly<PrivateLine>) => line.kind === PrivateLineKind.MESSAGE && line.message.isSelf && line.message.state !== ChatMessageState.SENT)
        .length >= CHAT_UNSENT_LIMIT);

    /** The keys each participant published, the latest last */
    private readonly published = new Map<string, ReadonlyArray<string>>();
    private readonly importedKeys = new Map<string, CryptoKey>();
    /** The key the local player shares with each key: its own key pair stays the same for the page */
    private readonly pairKeys = new Map<string, Promise<CryptoKey>>();
    /** The members of each conversation declared, as declared */
    private membersOf: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
    /** The members of each conversation declared, as the queue reached its declaration: the envelopes before it wait */
    private appliedMembers: ReadonlyMap<string, ReadonlyArray<string>> = new Map();
    private readonly waiting: ReceivedEnvelope[] = [];
    /** The messages read, by author and id: a message sent again shows once */
    private readonly seen = new Set<string>();
    /** The authors reported for an invalid message by every page: their first one only */
    private readonly invalidAuthors = new Set<string>();
    /** The authors reported by a recipient for a text it can not read: their first one only */
    private readonly invalidTexts = new Set<string>();
    private flood: ChatFlood = NO_FLOOD;
    private ownKeyPair?: Promise<OwnKey>;
    private keySent: boolean = false;
    /** The key of the local player came back on the chain since it published it, counted or not */
    private keyReturned: boolean = false;
    /** The older keys of the local player a part named: its key published again once for each, a page not having it */
    private readonly staleKeys = new Set<string>();
    private keyAsked: boolean = false;
    /** The keys appended live in the name of a participant away, not counted in its limit: bounded apart */
    private readonly awayKeys = new Map<string, number>();
    private destroyed: boolean = false;
    private readonly subscription: Subscription;
    private readonly ids: Generator<number, never> = idGenerator();
    /** The messages and the declarations apply one after the other, in the order of the chain: the keys are imported first */
    private queue: Promise<void> = Promise.resolve();
    private pending: number = 0;
    /** The messages of the local player are encrypted in the order it sent them */
    private sending: Promise<void> = Promise.resolve();

    public constructor(private readonly room: Room<PrivatePayloads>, options: PrivateConversationsOptions = {}) {
        this.keyStore = options.keyStore ?? new ParticipantKeyStore();
        this.subscription = merge(room.messenger(PrivateMessengerType.KEY), room.messenger(PrivateMessengerType.MESSAGE))
            .subscribe((message: PrivateMessage) => {
                const live: boolean = !room.isHistory(message);
                this.enqueue(() => logHandlingFailure(message, message.type === PrivateMessengerType.KEY
                    ? this.onKey(message, live)
                    : this.onEnvelope(message, live)));
            });
    }

    /** The local player, a member of the conversations of mine */
    public get localName(): string {
        return this.room.localPlayer.name;
    }

    /**
     * Declares the conversations of the game, replacing the ones declared before. The messages of a conversation the
     * page does not know yet wait for it: the private chain of a page reloaded may replay before the chain of the game
     * @throws Error when an id is invalid, or declared again with other members
     */
    public declare(conversations: ReadonlyArray<Readonly<PrivateConversation>>): void {
        const membersOf = new Map<string, ReadonlyArray<string>>(this.membersOf);

        for (const conversation of conversations) {
            const members: ReadonlyArray<string> = conversation.members;
            if (!CONVERSATION_ID.test(conversation.id) || members.length === 0 || members.length > PRIVATE_MAX_MEMBERS || new Set(members).size !== members.length) {
                throw new Error(`Invalid private conversation ${ conversation.id }`);
            }
            const declared: ReadonlyArray<string> | undefined = membersOf.get(conversation.id);
            if (declared !== undefined && !sameMembers(declared, members)) {
                throw new Error(`The private conversation ${ conversation.id } is declared again with other members`);
            }
            membersOf.set(conversation.id, [...members]);
        }

        this.membersOf = membersOf;
        this._conversations.set(conversations);
        this.enqueue(async () => {
            this.appliedMembers = membersOf;
            await this.judgeWaiting();
        });
    }

    /**
     * Why the composer of a conversation does not send, none when it may
     * @param now the time of the composer
     */
    public composerWait(conversationId: string, now: number): PrivateComposerWait | undefined {
        const conversation: Readonly<PrivateConversationView> | undefined = this.mine().find((mine: Readonly<PrivateConversationView>) => mine.id === conversationId);
        if (conversation?.open !== true) {
            return PrivateComposerWait.CLOSED;
        }
        if (conversation.missingKeys.length > 0) {
            return PrivateComposerWait.KEYS;
        }
        if (this.waitUntil(now) !== undefined) {
            return PrivateComposerWait.RATE;
        }
        return this.heldBack() ? PrivateComposerWait.UNSENT : undefined;
    }

    /**
     * When the composer may send another message, the local player having sent too many, in every conversation: they
     * would be hidden
     */
    public waitUntil(now: number): number | undefined {
        return sendWaitUntil(this.ownMessages().map((message: Readonly<ChatMessage>) => message.at), now);
    }

    /**
     * Sends a message, trimmed, to the members present: shown at once, waiting until the room sends it back, failed after
     * a while. A member away gets no part: on its return, the message is unreadable to it
     * @returns whether it was sent: not while the composer waits, nor a text the members would refuse
     */
    public send(conversationId: string, text: string): boolean {
        const at: number = Date.now();
        const message: string = text.trim();
        const id: string = crypto.randomUUID();
        if (this.composerWait(conversationId, at) !== undefined || !isChatText({ id, text: message, at })) {
            return false;
        }
        this.transmit(conversationId, message, id, at);
        return true;
    }

    /**
     * Sends again a message the room did not send back in time, under the same id, encrypted again
     * @returns whether it was sent: not while the composer waits, too many messages unsent excepted
     */
    public retry(conversationId: string, messageId: string): boolean {
        const at: number = Date.now();
        const wait: PrivateComposerWait | undefined = this.composerWait(conversationId, at);
        const failed: Readonly<ChatMessage> | undefined = this.ownLine(conversationId, messageId)?.message;
        if (failed?.state !== ChatMessageState.FAILED || (wait !== undefined && wait !== PrivateComposerWait.UNSENT)) {
            return false;
        }
        this.updateLines(conversationId, (lines: ReadonlyArray<Readonly<PrivateLine>>) => lines.filter((line: Readonly<PrivateLine>) =>
            line.kind !== PrivateLineKind.MESSAGE || line.message !== failed));
        this.transmit(conversationId, failed.text, messageId, at);
        return true;
    }

    /** Stops listening to the room: the messages received before are not applied, the ones being encrypted are not sent */
    public destroy(): void {
        this.destroyed = true;
        this.subscription.unsubscribe();
    }

    private enqueue(task: () => Promise<void>): void {
        this.pending++;
        this.queue = this.queue.then(async () => {
            if (this.destroyed) {
                return;
            }
            try {
                await task();
            } finally {
                this.pending--;
            }
            // Once what was received is applied, as a reloaded page catching up: its key published again only when lost
            if (this.pending === 0) {
                await this.publishKey();
            }
        }).catch((error: unknown) => TimedLogger.error('Failed to apply a change of the private conversations', error));
    }

    /** The key pair of agreement of the local player, read once for the page: without storage, another one at each read */
    private ownKey(): Promise<OwnKey> {
        this.ownKeyPair ??= this.readOwnKey();
        return this.ownKeyPair;
    }

    private async readOwnKey(): Promise<OwnKey> {
        const pair: CryptoKeyPair = await this.keyStore.agreementKeyPairOf(this.room.localPlayer.name);
        const key: PrivatePublicKey = await exportAgreementKey(pair.publicKey);
        const id: string = await keyIdOf(key);
        this.ownKeyId.set(id);
        return { pair, key, id };
    }

    /**
     * Publishes the key of the local player once it is a member of a conversation, unless its latest key on the chain is
     * already this one: a spectator publishes none
     */
    private async publishKey(): Promise<void> {
        const me: string = this.room.localPlayer.name;
        if (this.keySent || !this._conversations().some((conversation: Readonly<PrivateConversation>) => conversation.members.includes(me))) {
            return;
        }
        const own: OwnKey = await this.ownKey();
        if (!this.destroyed && (this.keyAsked || this.currentKeys().get(me) !== own.id)) {
            this.keySent = true;
            this.keyAsked = false;
            this.keyReturned = false;
            this.room.transmitMessage(PrivateMessengerType.KEY, { key: own.key });
            // Lost on its way, at a change of sequencer: published again, unless it came back meanwhile, refused included
            this.subscription.add(timer(SEND_TIMEOUT).subscribe(() => {
                if (!this.keyReturned) {
                    this.keySent = false;
                    this.enqueue(() => Promise.resolve());
                }
            }));
        }
    }

    /**
     * A key published: the latest one of its participant from then. A key published again by its participant is not
     * counted again; a key of another participant published by one is of no use to it, the parts of a recipient being
     * read with the keys it published. Every page records every key, to check the messages naming it the same
     * everywhere; a key appended live in the name of a participant away from this page does not replace its current
     * one: unknown to the room once it left, the sequencer may have forged it, its pages not checking the signature
     */
    private async onKey(message: KeyMessage, live: boolean): Promise<void> {
        const payload: unknown = message.payload;
        if (!isPrivateKeyPayload(payload)) {
            this.reportInvalid(message);
            return;
        }
        let imported: CryptoKey;
        try {
            imported = await importAgreementKey(payload.key);
        } catch {
            this.reportInvalid(message);
            return;
        }
        const id: string = await keyIdOf(payload.key);
        const mine: boolean = message.from === this.room.localPlayer.name;
        // Its own key read before any key in its name is told apart
        const own: string | undefined = mine ? (await this.ownKey()).id : undefined;
        if (mine && id === own) {
            this.keyReturned = true;
        }
        const keys: ReadonlyArray<string> = this.published.get(message.from) ?? [];
        // In the name of the local player, another key than its own is an older one, or forged: not counted on its page
        const away: boolean = mine
            ? id !== own
            : live && !this.room.players().some((player: Readonly<Player>) => player.name === message.from);
        if (!keys.includes(id) && !this.counted(message, away)) {
            return;
        }

        this.published.set(message.from, [...keys.filter((key: string) => key !== id), id]);
        this.importedKeys.set(id, imported);
        if (!away || !this.currentKeys().has(message.from)) {
            this.currentKeys.update((current: ReadonlyMap<string, string>) => new Map(current).set(message.from, id));
        }
        if (mine && id !== own) {
            // Another key in its name, an older one replayed or a forged one: the local player publishes its own again
            this.keySent = false;
            this.keyAsked = true;
        }
    }

    /**
     * Counts a new key of its participant, false when refused: past its limit, reported; appended while it was away,
     * forged maybe, bounded apart without report, its own key not to be refused for it
     */
    private counted(message: KeyMessage, away: boolean): boolean {
        const awayCount: number = this.awayKeys.get(message.from) ?? 0;
        if (away) {
            if (awayCount >= MAX_KEYS_PER_PARTICIPANT) {
                return false;
            }
            this.awayKeys.set(message.from, awayCount + 1);
            return true;
        }
        if ((this.published.get(message.from)?.length ?? 0) - awayCount >= MAX_KEYS_PER_PARTICIPANT) {
            this.reportInvalid(message);
            return false;
        }
        return true;
    }

    private isPublishedBy(participant: string, keyId: string): boolean {
        return this.published.get(participant)?.includes(keyId) ?? false;
    }

    /**
     * Checked by every page, on the private chain alone, the same everywhere: its form, the keys it names, published by
     * its sender and its recipients, its sender among them, then the rate of its sender
     */
    private async onEnvelope(message: EnvelopeMessage, live: boolean): Promise<void> {
        const envelope: unknown = message.payload;
        if (!isPrivateEnvelope(envelope) || !this.isPublishedBy(message.from, envelope.key)
            || !envelope.parts.every((part: Readonly<SealedPart>) => this.isPublishedBy(part.to, part.key))
            || !envelope.parts.some((part: Readonly<SealedPart>) => part.to === message.from)) {
            this.reportInvalid(message);
            return;
        }

        // A room without chain times its messages as they arrive, and does not count the rates
        const time: number | undefined = this.room.sequencedAt(message);
        let admission: Pick<ChatAdmission, 'shown' | 'notice'> = { shown: true, notice: false };
        if (time !== undefined) {
            const admitted: ChatAdmission = admitChatMessage(this.flood, message.from, time);
            this.flood = admitted.flood;
            admission = admitted;
        }

        const received: ReceivedEnvelope = { message, envelope, admitted: admission.shown, notice: admission.notice, live, time: time ?? Date.now() };
        if (this.appliedMembers.has(envelope.conversation)) {
            await this.judge(received);
        } else if (received.admitted || received.notice) {
            // Hidden by the rate of its author, it would not show: the messages waiting for a conversation are bounded
            this.waiting.push(received);
            this.waiting.splice(0, Math.max(0, this.waiting.length - WAITING_MAX));
        }
    }

    /** The envelopes waiting for their conversation, now declared, in the order of the chain */
    private async judgeWaiting(): Promise<void> {
        const declared: ReadonlyArray<ReceivedEnvelope> = this.waiting.filter((received: ReceivedEnvelope) =>
            this.appliedMembers.has(received.envelope.conversation));
        this.waiting.splice(0, this.waiting.length, ...this.waiting.filter((received: ReceivedEnvelope) => !declared.includes(received)));
        for (const received of declared) {
            if (this.destroyed) {
                return;
            }
            // eslint-disable-next-line no-await-in-loop -- the messages of a conversation show in the order of the chain
            await this.judge(received);
        }
    }

    /** Checked by every page once its conversation is declared: its sender and its recipients are members */
    private async judge(received: ReceivedEnvelope): Promise<void> {
        const { message, envelope } = received;
        const members: ReadonlyArray<string> = this.appliedMembers.get(envelope.conversation) as ReadonlyArray<string>;
        if (!members.includes(message.from) || envelope.parts.some((part: Readonly<SealedPart>) => !members.includes(part.to))) {
            this.reportInvalid(message);
            return;
        }
        if (members.includes(this.room.localPlayer.name)) {
            await this.read(received);
        }
    }

    /** Read by a member: its part decrypted and checked, or the message told unreadable */
    private async read(received: ReceivedEnvelope): Promise<void> {
        const { message, envelope } = received;
        const conversation: string = envelope.conversation;
        // Counted first, a message sent again included: the first one hidden tells the flood of its author
        if (received.notice) {
            this.addLine(conversation, { kind: PrivateLineKind.FLOOD, id: this.ids.next().value, name: message.from, at: received.time, live: received.live });
        }
        const seenKey: string = JSON.stringify([message.from, envelope.id]);
        if (this.seen.has(seenKey)) {
            return;
        }
        const sent: PrivateMessageLine | undefined = message.from === this.room.localPlayer.name ? this.ownLine(conversation, envelope.id) : undefined;
        if (!received.admitted) {
            // Its own message, waiting or failed: hidden from every page, sending it again would be too
            this.updateLines(conversation, (lines: ReadonlyArray<Readonly<PrivateLine>>) => lines.filter((line: Readonly<PrivateLine>) => line !== sent));
            return;
        }

        const own: OwnKey = await this.ownKey();
        if (this.destroyed) {
            return;
        }
        const part: Readonly<SealedPart> | undefined = envelope.parts.find((mine: Readonly<SealedPart>) => mine.to === this.room.localPlayer.name);
        if (part !== undefined && part.key !== own.id && received.live && !this.staleKeys.has(part.key)) {
            // Encrypted for an older key of the local player, the sender not having its current one: published again
            this.staleKeys.add(part.key);
            this.keyAsked = true;
            this.keySent = false;
        }
        if (part?.key !== own.id) {
            this.seen.add(seenKey);
            this.addLine(conversation, { kind: PrivateLineKind.UNREADABLE, id: this.ids.next().value, name: message.from, at: received.time, live: received.live });
            return;
        }
        if (sent !== undefined) {
            // Its own message back from the room: sent, moved where the room put it among the others
            this.seen.add(seenKey);
            this.updateLines(conversation, (lines: ReadonlyArray<Readonly<PrivateLine>>) => lines.filter((line: Readonly<PrivateLine>) => line !== sent)
                .concat({ ...sent, message: { ...sent.message, id: this.ids.next().value, state: ChatMessageState.SENT } }));
            return;
        }

        const text: PrivateText | undefined = await this.decrypt(envelope, part, message.from);
        if (this.destroyed) {
            return;
        }
        this.seen.add(seenKey);
        // The recipient alone tells its text invalid: the others can not check it
        if (text === undefined || !isChatText({ id: envelope.id, text: text.text, at: text.at })) {
            if (!this.invalidTexts.has(message.from)) {
                this.invalidTexts.add(message.from);
                this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
            }
            return;
        }
        this.addLine(conversation, {
            kind: PrivateLineKind.MESSAGE,
            live: received.live,
            message: {
                kind: ChatEntryKind.MESSAGE, id: this.ids.next().value, messageId: envelope.id, author: message.from, text: text.text,
                isSelf: message.from === this.room.localPlayer.name, at: text.at, state: ChatMessageState.SENT,
            },
        });
    }

    private async decrypt(envelope: PrivateEnvelope, part: Readonly<SealedPart>, from: string): Promise<PrivateText | undefined> {
        try {
            return await open(await this.pairKeyWith(envelope.key), part, {
                room: this.room.roomName, conversation: envelope.conversation, id: envelope.id, from, fromKey: envelope.key, to: part.to, toKey: part.key,
            });
        } catch {
            return undefined;
        }
    }

    /**
     * The key the local player shares with a key published: imported once checked, its derivation does not fail, and
     * is kept
     */
    private pairKeyWith(keyId: string): Promise<CryptoKey> {
        let shared: Promise<CryptoKey> | undefined = this.pairKeys.get(keyId);
        if (shared === undefined) {
            shared = this.ownKey().then((own: OwnKey) =>
                pairKey(own.pair.privateKey, this.importedKeys.get(keyId) as CryptoKey, this.room.roomName, [own.id, keyId]));
            this.pairKeys.set(keyId, shared);
        }
        return shared;
    }

    /** Shows the message at once, encrypted for the latest key of each member present, waiting until the room sends it back */
    private transmit(conversation: string, text: string, id: string, at: number): void {
        const me: string = this.room.localPlayer.name;
        const line: PrivateMessageLine = {
            kind: PrivateLineKind.MESSAGE,
            live: true,
            message: { kind: ChatEntryKind.MESSAGE, id: this.ids.next().value, messageId: id, author: me, text, isSelf: true, at, state: ChatMessageState.SENDING },
        };
        this.addLine(conversation, line);

        const present = new Set<string>(this.room.players().map((player: Readonly<Player>) => player.name));
        const keys: ReadonlyMap<string, string> = this.currentKeys();
        const recipients: ReadonlyArray<readonly [string, string]> = (this.membersOf.get(conversation) as ReadonlyArray<string>)
            .filter((member: string) => member === me || present.has(member))
            .map((member: string) => [member, keys.get(member) as string] as const);
        this.sending = this.sending.then(() => logHandlingFailure(
            { type: PrivateMessengerType.MESSAGE, from: me },
            this.sealAndSend(conversation, id, { at, text }, recipients),
        ));

        this.subscription.add(timer(SEND_TIMEOUT).subscribe(() => this.updateLines(conversation, (lines: ReadonlyArray<Readonly<PrivateLine>>) =>
            lines.map((other: Readonly<PrivateLine>) => (other === line ? { ...line, message: { ...line.message, state: ChatMessageState.FAILED } } : other)))));
    }

    private async sealAndSend(conversation: string, id: string, text: PrivateText, recipients: ReadonlyArray<readonly [string, string]>): Promise<void> {
        const own: OwnKey = await this.ownKey();
        const from: string = this.room.localPlayer.name;
        const parts: ReadonlyArray<SealedPart> = await Promise.all(recipients.map(async ([to, toKey]: readonly [string, string]) => ({
            to,
            key: toKey,
            ...await seal(await this.pairKeyWith(toKey), text, { room: this.room.roomName, conversation, id, from, fromKey: own.id, to, toKey }),
        })));
        if (!this.destroyed) {
            this.room.transmitMessage(PrivateMessengerType.MESSAGE, { conversation, id, key: own.id, parts });
        }
    }

    /** The message of the local player the room did not send back yet, waiting or failed */
    private ownLine(conversation: string, messageId: string): PrivateMessageLine | undefined {
        return this.lines().get(conversation)?.find((line: Readonly<PrivateLine>): line is PrivateMessageLine => line.kind === PrivateLineKind.MESSAGE
            && line.message.isSelf && line.message.messageId === messageId && line.message.state !== ChatMessageState.SENT);
    }

    private addLine(conversation: string, line: Readonly<PrivateLine>): void {
        this.updateLines(conversation, (lines: ReadonlyArray<Readonly<PrivateLine>>) => lines.concat(line));
    }

    private updateLines(conversation: string, update: (lines: ReadonlyArray<Readonly<PrivateLine>>) => ReadonlyArray<Readonly<PrivateLine>>): void {
        this.lines.update((all: ReadonlyMap<string, ReadonlyArray<Readonly<PrivateLine>>>) => new Map(all).set(conversation, update(all.get(conversation) ?? [])));
    }

    /** Reports the first invalid message of an author only, the same on every page, rather than a report per message */
    private reportInvalid(message: AppMessage): void {
        if (!this.invalidAuthors.has(message.from)) {
            this.invalidAuthors.add(message.from);
            this.room.reportCheat(message, CheatReason.INVALID_MESSAGE);
        }
    }
}
