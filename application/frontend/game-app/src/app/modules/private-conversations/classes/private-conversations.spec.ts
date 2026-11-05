import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { CHAT_RATE_LIMIT, CHAT_SEND_LIMIT, CHAT_UNSENT_LIMIT, CHAT_RATE_WINDOW } from '@app/modules/chat-page/components/chat/chat-flood';
import { SEND_TIMEOUT } from '@app/modules/chat-page/components/chat/chat.component';
import { ChatMessageState } from '@app/modules/chat-page/components/chat/chat-message/chat-message.component';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { ParticipantKeyStore } from '@app/services/room-manager/classes/room/block-room/block-chain/participant-key-store';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TestHelper } from '@testing/test.helper';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrivateConversation } from './private-conversation';
import { MAX_KEYS_PER_PARTICIPANT, PrivateComposerWait, PrivateConversations, PrivateLine, PrivateLineKind } from './private-conversations';
import { exportAgreementKey, importAgreementKey, keyIdOf, pairKey, seal } from './private-crypto';
import { PrivateEnvelope, PrivateKeyPayload, PrivateMessengerType, PrivatePayloads, PrivatePublicKey, SealedPart } from './private-messages';

const TEAM: PrivateConversation = { id: 'team', members: ['alice', 'bob'], title: { key: 'team' }, open: true };
const SIDE: PrivateConversation = { id: 'side', members: ['alice', 'mallory'], title: { key: 'side' }, open: true };
const TRIO: PrivateConversation = { id: 'trio', members: ['alice', 'bob', 'carol'], title: { key: 'trio' }, open: true };
const CONVERSATIONS: ReadonlyArray<PrivateConversation> = [TEAM, SIDE];
const INVALID: string = CheatReason.INVALID_MESSAGE;

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('PrivateConversations', { timeout: 30_000 }, () => {
    let hub: RoomHub<PrivatePayloads>;
    let factory: IDBFactory;
    let rooms: Map<string, Room<PrivatePayloads>>;
    let pages: Map<string, PrivateConversations>;

    function page(name: string, keyStore: ParticipantKeyStore = new ParticipantKeyStore(factory)): PrivateConversations {
        const room: Room<PrivatePayloads> = rooms.get(name) ?? hub.room(name);
        const conversations = new PrivateConversations(room, { keyStore });
        rooms.set(name, room);
        pages.set(name, conversations);
        return conversations;
    }

    const of = (name: string): PrivateConversations => pages.get(name) as PrivateConversations;

    /** The pages of the players, each one declaring the conversations */
    function pagesOf(names: ReadonlyArray<string>, conversations: ReadonlyArray<PrivateConversation> = CONVERSATIONS): void {
        names.forEach((name: string) => page(name).declare(conversations));
    }

    /** The page of the player reloaded: the chain replayed to it, then the conversations declared by the game */
    function reload(name: string, conversations: ReadonlyArray<PrivateConversation> = CONVERSATIONS, keyStore?: ParticipantKeyStore): void {
        of(name).destroy();
        hub.close(rooms.get(name) as Room<PrivatePayloads>);
        rooms.delete(name);
        page(name, keyStore);
        hub.replay(rooms.get(name) as Room<PrivatePayloads>);
        of(name).declare(conversations);
    }

    function describeLine(line: Readonly<PrivateLine>): string {
        if (line.kind === PrivateLineKind.MESSAGE) {
            const state: string = line.message.state === ChatMessageState.SENT ? '' : ` (${ line.message.state })`;
            return `${ line.message.author }: ${ line.message.text }${ state }`;
        }
        return `${ line.kind } ${ line.name }`;
    }

    /** The lines of a conversation of the player, as `author: text`, `flood author` or `unreadable author` */
    function linesOf(name: string, conversation: string = TEAM.id): string[] {
        return of(name).mine().find((view) => view.id === conversation)?.lines.map(describeLine) ?? [];
    }

    async function ready(name: string, conversation: string = TEAM.id): Promise<void> {
        await eventually(() => expect(of(name).composerWait(conversation, Date.now())).toBeUndefined());
    }

    function messagesOf(type: PrivateMessengerType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    function envelopes(from?: string): PrivateEnvelope[] {
        return messagesOf(PrivateMessengerType.MESSAGE, from).map((message: AppMessage) => message.payload as PrivateEnvelope);
    }

    /** The latest key the participant published on the chain */
    function latestKey(name: string): PrivatePublicKey {
        return (messagesOf(PrivateMessengerType.KEY, name).at(-1)?.payload as PrivateKeyPayload).key;
    }

    async function storedKey(name: string): Promise<{ readonly pair: CryptoKeyPair; readonly key: PrivatePublicKey; readonly id: string }> {
        const pair: CryptoKeyPair = await new ParticipantKeyStore(factory).agreementKeyPairOf(name);
        const key: PrivatePublicKey = await exportAgreementKey(pair.publicKey);
        return { pair, key, id: await keyIdOf(key) };
    }

    /** A participant without page publishes its stored key, as a cheating client would */
    /** A participant present in the room without the page of the conversations, its messages sent by the spec */
    function present(name: string): void {
        if (!rooms.has(name)) {
            hub.room(name);
        }
    }

    async function publish(name: string): Promise<void> {
        present(name);
        hub.send({ from: name, type: PrivateMessengerType.KEY, payload: { key: (await storedKey(name)).key } });
    }

    /** An envelope encrypted as a client would, for the latest keys of the recipients on the chain */
    async function sealed(
        from: string, conversation: string, text: string, recipients: ReadonlyArray<string>, at: number = Date.now(), id: string = crypto.randomUUID(),
    ): Promise<PrivateEnvelope> {
        const sender = await storedKey(from);
        const parts: SealedPart[] = await Promise.all(recipients.map(async (to: string) => {
            const recipient: PrivatePublicKey = latestKey(to);
            const toKey: string = await keyIdOf(recipient);
            const shared: CryptoKey = await pairKey(sender.pair.privateKey, await importAgreementKey(recipient), 'room', [sender.id, toKey]);
            return { to, key: toKey, ...await seal(shared, { at, text }, { room: 'room', conversation, id, from, fromKey: sender.id, to, toKey }) };
        }));
        return { conversation, id, key: sender.id, parts };
    }

    function sendEnvelope(from: string, envelope: unknown): void {
        hub.send({ from, type: PrivateMessengerType.MESSAGE, payload: envelope });
    }

    /** Lets the pages apply what they received and send what they encrypt, until the chain is still */
    async function applied(): Promise<void> {
        const pending = (): Promise<void>[] => [...pages.values()].flatMap((conversations: PrivateConversations) => {
            const { queue, sending } = TestHelper.cast<{ readonly queue: Promise<void>; readonly sending: Promise<void> }>(conversations);
            return [queue, sending];
        });
        let before: Promise<void>[];
        do {
            before = pending();
            await Promise.all(before);
        } while (pending().some((promise: Promise<void>, index: number) => promise !== before[index]));
    }

    beforeEach(() => {
        hub = new RoomHub<PrivatePayloads>();
        factory = new IDBFactory();
        rooms = new Map();
        pages = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        pages.forEach((conversations: PrivateConversations) => conversations.destroy());
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should keep the key pair of agreement in the browser by default', () => {
        expect(() => new PrivateConversations(hub.room('zoe')).destroy()).not.toThrow();
    });

    test('should publish the key of each member once, none of a spectator', async () => {
        // When
        pagesOf(['alice', 'bob', 'eve'], [TEAM]);
        await ready('alice');
        await ready('bob');
        await applied();

        // Then
        expect(messagesOf(PrivateMessengerType.KEY).map((message: AppMessage) => message.from).sort()).toEqual(['alice', 'bob']);
        expect(latestKey('alice')).toEqual((await storedKey('alice')).key);
        expect(of('eve').mine()).toEqual([]);
        expect(of('eve').conversations()).toEqual([TEAM]);
        expect(of('eve').composerWait(TEAM.id, Date.now())).toEqual(PrivateComposerWait.CLOSED);
    });

    test('should wait for the keys of the members present, the local player included', async () => {
        // Given: Bob present, his page not declaring the conversation yet
        page('bob');
        const alice: PrivateConversations = page('alice');

        // When
        alice.declare([TEAM]);

        // Then
        expect(alice.mine()[0].missingKeys).toEqual(['alice', 'bob']);
        await eventually(() => expect(alice.mine()[0].missingKeys).toEqual(['bob']));
        expect(alice.composerWait(TEAM.id, Date.now())).toEqual(PrivateComposerWait.KEYS);
        expect(alice.send(TEAM.id, 'hello')).toBe(false);

        // When
        of('bob').declare([TEAM]);

        // Then
        await ready('alice');
        expect(alice.send(TEAM.id, 'hello')).toBe(true);
        await eventually(() => expect(linesOf('bob')).toEqual(['alice: hello']));
    });

    test('should send a message to each member, its sender included, read by them only', async () => {
        // Given
        pagesOf(['alice', 'bob', 'carol', 'eve'], [TEAM, TRIO]);
        await ready('alice');

        // When
        expect(of('alice').send(TEAM.id, '  I put 7\nin the trunk  ')).toBe(true);

        // Then
        expect(linesOf('alice')).toEqual(['alice: I put 7\nin the trunk (sending)']);
        await eventually(() => expect(linesOf('bob')).toEqual(['alice: I put 7\nin the trunk']));
        await eventually(() => expect(linesOf('alice')).toEqual(['alice: I put 7\nin the trunk']));
        expect(envelopes('alice')[0].parts.map((part: SealedPart) => part.to)).toEqual(['alice', 'bob']);
        expect(JSON.stringify(envelopes('alice'))).not.toContain('trunk');
        expect(linesOf('carol', TRIO.id)).toEqual([]);
        expect(of('eve').mine()).toEqual([]);
        const [line] = of('bob').mine()[0].lines;
        expect(line).toEqual(expect.objectContaining({ kind: PrivateLineKind.MESSAGE, live: true }));
        expect(hub.reports).toEqual([]);
    });

    test('should refuse a message blank, holding a link, or in a conversation closed or not of the player', async () => {
        // Given
        pagesOf(['alice', 'bob'], [TEAM, { ...TRIO, open: false }]);
        await ready('alice');

        // Then
        expect(of('alice').send(TEAM.id, '   ')).toBe(false);
        expect(of('alice').send(TEAM.id, 'see example.com')).toBe(false);
        expect(of('alice').send(TRIO.id, 'hello')).toBe(false);
        expect(of('alice').composerWait(TRIO.id, Date.now())).toEqual(PrivateComposerWait.CLOSED);
        expect(of('alice').send(SIDE.id, 'hello')).toBe(false);
        expect(envelopes()).toEqual([]);
    });

    test('should keep the messages of a conversation the page did not declare yet, then show them', async () => {
        // Given
        pagesOf(['alice'], [TEAM, TRIO]);
        page('bob').declare([TEAM]);
        page('carol').declare([]);
        await ready('alice');
        await publish('carol');
        await ready('alice', TRIO.id);

        // When
        of('alice').send(TRIO.id, 'to the trio');
        of('alice').send(TEAM.id, 'to the team');
        await eventually(() => expect(linesOf('bob')).toEqual(['alice: to the team']));
        await applied();
        of('bob').declare([TEAM, TRIO]);
        of('carol').declare([TRIO]);

        // Then
        await eventually(() => expect(linesOf('bob', TRIO.id)).toEqual(['alice: to the trio']));
        await eventually(() => expect(linesOf('carol', TRIO.id)).toEqual(['alice: to the trio']));
        expect(hub.reports).toEqual([]);
    });

    test('should give no part to a member away, even when a key is published in its name', async () => {
        // Given
        pagesOf(['alice', 'bob', 'carol'], [TRIO]);
        await ready('alice', TRIO.id);
        await eventually(() => expect(messagesOf(PrivateMessengerType.KEY)).toHaveLength(3));
        of('carol').destroy();
        hub.leave(rooms.get('carol') as Room<PrivatePayloads>);
        const forged: PrivatePublicKey = await exportAgreementKey((await ParticipantKeyStore.generateAgreementKeyPair()).publicKey);
        hub.send({ from: 'carol', type: PrivateMessengerType.KEY, payload: { key: forged } });
        await applied();

        // When
        expect(of('alice').mine()[0].missingKeys).toEqual([]);
        of('alice').send(TRIO.id, 'carol left');

        // Then
        await eventually(() => expect(linesOf('bob', TRIO.id)).toEqual(['alice: carol left']));
        expect(envelopes('alice')[0].parts.map((part: SealedPart) => part.to)).toEqual(['alice', 'bob']);

        // When
        rooms.delete('carol');
        page('carol');
        hub.replay(rooms.get('carol') as Room<PrivatePayloads>);
        of('carol').declare([TRIO]);

        // Then
        await eventually(() => expect(linesOf('carol', TRIO.id)).toEqual(['unreadable alice']));
        const carolKey: PrivatePublicKey = (await storedKey('carol')).key;
        await eventually(() => expect(latestKey('carol')).toEqual(carolKey));
        expect(hub.reports).toEqual([]);
    });

    test('should ignore a key appended in the name of a member away, encrypting for its own key once it is back', async () => {
        // Given: Carol away, her page kept, a key forged in her name meanwhile
        pagesOf(['alice', 'bob', 'carol'], [TRIO]);
        await ready('alice', TRIO.id);
        await ready('bob', TRIO.id);
        await ready('carol', TRIO.id);
        await applied();
        const carolKey: string = (await storedKey('carol')).id;
        const carol: Room<PrivatePayloads> = rooms.get('carol') as Room<PrivatePayloads>;
        hub.leave(carol);
        const forged: PrivatePublicKey = await exportAgreementKey((await ParticipantKeyStore.generateAgreementKeyPair()).publicKey);
        hub.send({ from: 'carol', type: PrivateMessengerType.KEY, payload: { key: forged } });
        await applied();

        // When: back without reload, before her page publishes its key again
        hub.hold('carol');
        hub.back(carol);
        await applied();
        of('bob').send(TRIO.id, 'welcome back');

        // Then
        await eventually(() => expect(envelopes('bob')).toHaveLength(1));
        expect(envelopes('bob')[0].parts.find((part: SealedPart) => part.to === 'carol')?.key).toEqual(carolKey);
        expect(messagesOf(PrivateMessengerType.KEY, 'alice')).toHaveLength(1);
        expect(messagesOf(PrivateMessengerType.KEY, 'bob')).toHaveLength(1);

        // When: her page saw the forged key in her name, and publishes her own again
        hub.release();

        // Then
        await eventually(() => expect(linesOf('carol', TRIO.id)).toEqual(['bob: welcome back']));
        const carolPublic: PrivatePublicKey = (await storedKey('carol')).key;
        await eventually(() => expect(latestKey('carol')).toEqual(carolPublic));
        expect(hub.reports).toEqual([]);
    });

    test('should read its messages again after a reload, its key kept', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        of('alice').send(TEAM.id, 'hello');
        await eventually(() => expect(linesOf('bob')).toEqual(['alice: hello']));
        of('bob').send(TEAM.id, 'hi');
        await eventually(() => expect(linesOf('alice')).toEqual(['alice: hello', 'bob: hi']));

        // When
        reload('alice');

        // Then
        await eventually(() => expect(linesOf('alice')).toEqual(['alice: hello', 'bob: hi']));
        await applied();
        expect(messagesOf(PrivateMessengerType.KEY, 'alice')).toHaveLength(1);
        expect(of('alice').mine()[0].lines.every((line: Readonly<PrivateLine>) => !line.live)).toBe(true);
        await ready('alice');
    });

    test('should tell the messages written for a key lost unreadable, then read the next ones', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        of('alice').send(TEAM.id, 'hello');
        await eventually(() => expect(linesOf('bob')).toEqual(['alice: hello']));

        // When
        reload('alice', CONVERSATIONS, new ParticipantKeyStore(new IDBFactory()));

        // Then
        await eventually(() => expect(linesOf('alice')).toEqual(['unreadable alice']));
        await eventually(() => expect(messagesOf(PrivateMessengerType.KEY, 'alice')).toHaveLength(2));
        await applied();
        of('bob').send(TEAM.id, 'your new key');
        await eventually(() => expect(linesOf('alice')).toEqual(['unreadable alice', 'bob: your new key']));
        expect(hub.reports).toEqual([]);
    });

    test('should not count a key published again, report the keys of a participant past the limit', async () => {
        // Given
        pagesOf(['alice', 'eve']);
        const keys: PrivatePublicKey[] = await Promise.all(Array.from({ length: MAX_KEYS_PER_PARTICIPANT + 1 }, async () =>
            exportAgreementKey((await ParticipantKeyStore.generateAgreementKeyPair()).publicKey)));
        present('mallory');
        const sendKey = (key: PrivatePublicKey): void => hub.send({ from: 'mallory', type: PrivateMessengerType.KEY, payload: { key } });

        // When
        keys.slice(0, MAX_KEYS_PER_PARTICIPANT).forEach(sendKey);
        keys.slice(0, 4).forEach(sendKey);
        await applied();

        // Then
        expect(hub.reports).toEqual([]);

        // When
        sendKey(keys[MAX_KEYS_PER_PARTICIPANT]);
        sendKey(keys[MAX_KEYS_PER_PARTICIPANT]);
        await applied();

        // Then
        expect(hub.reported().sort()).toEqual([`alice ${ INVALID } mallory`, `eve ${ INVALID } mallory`]);
    });

    test.each<[string, unknown]>([
        ['not of the form of a key', { key: 'key' }],
        ['off the curve', { key: { kty: 'EC', crv: 'P-384', x: `${ 'A'.repeat(63) }B`, y: `${ 'A'.repeat(63) }B` } }],
    ])('should report a key %s, once', async (_: string, payload: unknown) => {
        // Given
        pagesOf(['alice', 'eve']);
        present('mallory');

        // When
        hub.send({ from: 'mallory', type: PrivateMessengerType.KEY, payload });
        hub.send({ from: 'mallory', type: PrivateMessengerType.KEY, payload });
        await applied();

        // Then
        expect(hub.reported().sort()).toEqual([`alice ${ INVALID } mallory`, `eve ${ INVALID } mallory`]);
    });

    test.each<[string, (envelope: PrivateEnvelope) => unknown]>([
        ['not of the form of an envelope', (envelope: PrivateEnvelope) => ({ ...envelope, conversation: 'Side' })],
        ['naming a key its sender did not publish', (envelope: PrivateEnvelope) => ({ ...envelope, key: 'f'.repeat(64) })],
        ['naming a key its recipient did not publish', (envelope: PrivateEnvelope) => ({
            ...envelope, parts: envelope.parts.map((part: SealedPart) => (part.to === 'alice' ? { ...part, key: 'f'.repeat(64) } : part)),
        })],
        ['with a part for a participant without key', (envelope: PrivateEnvelope) => ({ ...envelope, parts: [...envelope.parts, { ...envelope.parts[0], to: 'nobody' }] })],
        ['without a part for its sender', (envelope: PrivateEnvelope) => ({ ...envelope, parts: envelope.parts.filter((part: SealedPart) => part.to !== 'mallory') })],
        ['with a part for a participant out of the conversation', (envelope: PrivateEnvelope) => ({
            ...envelope, parts: [...envelope.parts, { ...envelope.parts[0], to: 'bob', key: 'b'.repeat(64) }],
        })],
        ['from a participant out of the conversation', (envelope: PrivateEnvelope) => ({ ...envelope, conversation: TEAM.id })],
    ])('should report an envelope %s on every page, once', async (_: string, change: (envelope: PrivateEnvelope) => unknown) => {
        // Given
        pagesOf(['alice', 'bob', 'eve']);
        await ready('alice');
        await ready('bob');
        await publish('mallory');
        await applied();
        const bobKey: string = await keyIdOf(latestKey('bob'));
        const withBob = (changed: unknown): unknown => JSON.parse(JSON.stringify(changed).replaceAll('b'.repeat(64), bobKey));

        // When
        sendEnvelope('mallory', withBob(change(await sealed('mallory', SIDE.id, 'hello', ['alice', 'mallory']))));
        sendEnvelope('mallory', withBob(change(await sealed('mallory', SIDE.id, 'again', ['alice', 'mallory']))));
        await applied();

        // Then
        expect(hub.reported().sort()).toEqual([`alice ${ INVALID } mallory`, `bob ${ INVALID } mallory`, `eve ${ INVALID } mallory`]);
        expect(linesOf('alice', SIDE.id)).toEqual([]);
    });

    test.each<[string, (envelope: PrivateEnvelope) => PrivateEnvelope]>([
        ['not decrypting', (envelope: PrivateEnvelope) => ({
            ...envelope, parts: envelope.parts.map((part: SealedPart) => (part.to === 'alice' ? { ...part, iv: 'AAAAAAAAAAAAAAAA' } : part)),
        })],
        ['holding a link', (envelope: PrivateEnvelope) => envelope],
    ])('should report a text %s by its recipients only, once', async (_: string, change: (envelope: PrivateEnvelope) => PrivateEnvelope) => {
        // Given
        pagesOf(['alice', 'bob', 'eve']);
        await ready('alice');
        await publish('mallory');
        await applied();

        // When
        sendEnvelope('mallory', change(await sealed('mallory', SIDE.id, 'see example.com', ['alice', 'mallory'])));
        sendEnvelope('mallory', change(await sealed('mallory', SIDE.id, 'and example.org', ['alice', 'mallory'])));
        await applied();

        // Then
        expect(hub.reported().sort()).toEqual([`alice ${ INVALID } mallory`]);
        expect(linesOf('alice', SIDE.id)).toEqual([]);
    });

    test('should show a message sent again once', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        const envelope: PrivateEnvelope = await sealed('bob', TEAM.id, 'twice', ['alice', 'bob']);

        // When
        sendEnvelope('bob', envelope);
        sendEnvelope('bob', { ...envelope, parts: [...envelope.parts].reverse() });
        await applied();

        // Then
        expect(linesOf('alice')).toEqual(['bob: twice']);
        expect(linesOf('bob')).toEqual(['bob: twice']);
    });

    test('should hide the messages of an author over the rate, and tell it once in the conversation', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        hub.time = 1000;
        const flood: PrivateEnvelope[] = await Promise.all(Array.from({ length: CHAT_RATE_LIMIT + 2 }, (_: unknown, index: number) =>
            sealed('bob', TEAM.id, `message ${ index }`, ['alice', 'bob'])));

        // When
        flood.forEach((envelope: PrivateEnvelope) => sendEnvelope('bob', envelope));
        await applied();

        // Then
        const shown: string[] = flood.slice(0, CHAT_RATE_LIMIT).map((_: PrivateEnvelope, index: number) => `bob: message ${ index }`);
        expect(linesOf('alice')).toEqual([...shown, 'flood bob']);
        expect(linesOf('bob')).toEqual([...shown, 'flood bob']);

        // When
        hub.time += CHAT_RATE_WINDOW;
        sendEnvelope('bob', await sealed('bob', TEAM.id, 'calm again', ['alice', 'bob']));
        await applied();

        // Then
        expect(linesOf('alice')).toEqual([...shown, 'flood bob', 'bob: calm again']);
        expect(hub.reports).toEqual([]);
    });

    test('should tell the flood of an author once its first message hidden is one sent again', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        hub.time = 1000;
        const flood: PrivateEnvelope[] = await Promise.all(Array.from({ length: CHAT_RATE_LIMIT }, (_: unknown, index: number) =>
            sealed('bob', TEAM.id, `message ${ index }`, ['alice', 'bob'])));
        const hidden: PrivateEnvelope = await sealed('bob', TEAM.id, 'hidden', ['alice', 'bob']);
        flood.forEach((envelope: PrivateEnvelope) => sendEnvelope('bob', envelope));

        // When
        sendEnvelope('bob', flood[0]);
        sendEnvelope('bob', hidden);
        await applied();

        // Then
        const shown: string[] = flood.map((_: PrivateEnvelope, index: number) => `bob: message ${ index }`);
        expect(linesOf('alice')).toEqual([...shown, 'flood bob']);
        expect(linesOf('bob')).toEqual([...shown, 'flood bob']);
    });

    test('should drop its own message hidden for its rate', async () => {
        // Given
        pagesOf(['alice', 'bob']);
        await ready('alice');
        // Written a while ago by its clock: the composer does not wait
        const flood: PrivateEnvelope[] = await Promise.all(Array.from({ length: CHAT_RATE_LIMIT }, (_: unknown, index: number) =>
            sealed('alice', TEAM.id, `script ${ index }`, ['alice', 'bob'], Date.now() - CHAT_RATE_WINDOW)));
        flood.forEach((envelope: PrivateEnvelope) => sendEnvelope('alice', envelope));
        await applied();

        // When
        of('alice').send(TEAM.id, 'one too many');

        // Then
        await eventually(() => expect(linesOf('alice').at(-1)).toEqual('flood alice'));
        expect(linesOf('alice')).not.toContain('alice: one too many (sending)');
        expect(linesOf('bob').at(-1)).toEqual('flood alice');
    });

    test('should show every message in a room without chain times', async () => {
        // Given
        const room: Room<PrivatePayloads> = hub.room('alice');
        rooms.set('alice', Object.assign(room, { sequencedAt: () => undefined }));
        pagesOf(['alice', 'bob']);
        await ready('alice');
        await ready('bob');
        const flood: PrivateEnvelope[] = await Promise.all(Array.from({ length: CHAT_RATE_LIMIT + 1 }, (_: unknown, index: number) =>
            sealed('bob', TEAM.id, `message ${ index }`, ['alice', 'bob'])));

        // When
        flood.forEach((envelope: PrivateEnvelope) => sendEnvelope('bob', envelope));
        await applied();

        // Then
        expect(linesOf('alice')).toHaveLength(CHAT_RATE_LIMIT + 1);
        expect(linesOf('alice').at(-1)).toEqual(`bob: message ${ CHAT_RATE_LIMIT }`);
        expect(linesOf('bob').at(-1)).toEqual('flood bob');
    });

    describe('sending', () => {
        test('should wait after the messages the composer may send within the window', async () => {
            // Given
            pagesOf(['alice', 'bob']);
            await ready('alice');
            const start: number = Date.now();

            // When
            for (let index = 0; index < CHAT_SEND_LIMIT; index++) {
                expect(of('alice').send(TEAM.id, `message ${ index }`)).toBe(true);
            }

            // Then
            expect(of('alice').composerWait(TEAM.id, Date.now())).toEqual(PrivateComposerWait.RATE);
            expect(of('alice').waitUntil(Date.now())).toBeGreaterThanOrEqual(start + CHAT_RATE_WINDOW);
            expect(of('alice').send(TEAM.id, 'too soon')).toBe(false);
            await eventually(() => expect(linesOf('bob')).toEqual(['alice: message 0', 'alice: message 1', 'alice: message 2']));
            expect(of('alice').composerWait(TEAM.id, Date.now() + CHAT_RATE_WINDOW)).toBeUndefined();
        });

        test('should fail a message not sent back in time, send it again under the same id', async () => {
            // Given
            pagesOf(['alice', 'bob']);
            await ready('alice');
            await applied();
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
            hub.hold('alice');
            of('alice').send(TEAM.id, 'hello');

            // When
            vi.advanceTimersByTime(SEND_TIMEOUT);

            // Then
            expect(linesOf('alice')).toEqual(['alice: hello (failed)']);
            const [line] = of('alice').mine()[0].lines;
            const messageId: string = line.kind === PrivateLineKind.MESSAGE ? line.message.messageId : '';
            expect(of('alice').retry(TEAM.id, 'another-id')).toBe(false);
            expect(of('alice').retry(SIDE.id, messageId)).toBe(false);
            of('alice').declare([{ ...TEAM, open: false }, SIDE]);
            expect(of('alice').retry(TEAM.id, messageId)).toBe(false);
            of('alice').declare(CONVERSATIONS);

            // When
            expect(of('alice').retry(TEAM.id, messageId)).toBe(true);

            // Then
            expect(linesOf('alice')).toEqual(['alice: hello (sending)']);
            await eventually(() => expect(hub.held).toHaveLength(2));
            hub.release();
            await applied();
            expect(linesOf('alice')).toEqual(['alice: hello']);
            expect(linesOf('bob')).toEqual(['alice: hello']);
            expect(envelopes('alice').map((envelope: PrivateEnvelope) => envelope.id)).toEqual([messageId, messageId]);
            expect(of('alice').retry(TEAM.id, messageId)).toBe(false);
        });

        test('should hold back the composer while too many messages are not sent back, Retry still sending', async () => {
            // Given
            pagesOf(['alice', 'bob']);
            await ready('alice');
            await applied();
            vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
            hub.hold('alice');
            for (let index = 0; index < CHAT_SEND_LIMIT; index++) {
                of('alice').send(TEAM.id, `first ${ index }`);
            }
            expect(of('alice').retry(TEAM.id, 'none')).toBe(false);
            vi.advanceTimersByTime(SEND_TIMEOUT);
            for (let index = CHAT_SEND_LIMIT; index < CHAT_UNSENT_LIMIT; index++) {
                of('alice').send(TEAM.id, `then ${ index }`);
            }

            // Then
            expect(of('alice').heldBack()).toBe(true);
            expect(of('alice').composerWait(TEAM.id, Date.now())).toEqual(PrivateComposerWait.UNSENT);
            expect(of('alice').send(TEAM.id, 'held back')).toBe(false);

            // When
            const [failed] = of('alice').mine()[0].lines;
            const retried: boolean = of('alice').retry(TEAM.id, failed.kind === PrivateLineKind.MESSAGE ? failed.message.messageId : '');

            // Then
            expect(retried).toBe(true);
            vi.useRealTimers();
            await eventually(() => expect(hub.held).toHaveLength(CHAT_UNSENT_LIMIT + 1));
            hub.release();
            await eventually(() => expect(linesOf('bob')).toHaveLength(CHAT_UNSENT_LIMIT));
        });

        test('should send nothing once destroyed while the message is encrypted', async () => {
            // Given
            pagesOf(['alice', 'bob']);
            await ready('alice');

            // When
            of('alice').send(TEAM.id, 'hello');
            of('alice').destroy();
            await applied();

            // Then
            expect(envelopes()).toEqual([]);
        });
    });

    describe('declare', () => {
        test.each<[string, PrivateConversation]>([
            ['an invalid id', { ...TEAM, id: 'Team' }],
            ['no member', { ...TEAM, members: [] }],
            ['too many members', { ...TEAM, members: Array.from({ length: 9 }, (_: unknown, index: number) => `p${ index }`) }],
            ['a member twice', { ...TEAM, members: ['alice', 'alice'] }],
        ])('should refuse a conversation of %s', (_: string, conversation: PrivateConversation) => {
            expect(() => page('alice').declare([conversation])).toThrow(`Invalid private conversation ${ conversation.id }`);
        });

        test('should refuse an id declared again with other members, keep the conversations declared', () => {
            // Given
            const alice: PrivateConversations = page('alice');
            alice.declare([TEAM]);

            // When
            alice.declare([{ ...TEAM, members: ['bob', 'alice'], open: false }]);

            // Then
            expect(alice.conversations()).toEqual([{ ...TEAM, members: ['bob', 'alice'], open: false }]);
            expect(() => alice.declare([{ ...TEAM, members: ['alice', 'carol'] }])).toThrow('The private conversation team is declared again with other members');
            expect(() => alice.declare([{ ...TEAM, members: ['alice'] }])).toThrow('The private conversation team is declared again with other members');
            expect(() => alice.declare([SIDE, { ...SIDE, members: ['alice', 'bob'] }])).toThrow('The private conversation side is declared again with other members');
            expect(alice.conversations()).toEqual([{ ...TEAM, members: ['bob', 'alice'], open: false }]);
            expect(() => alice.declare([SIDE])).not.toThrow();
        });
    });

    describe('destroy', () => {
        test('should apply nothing received before', async () => {
            // Given
            pagesOf(['alice', 'bob']);
            await ready('alice');
            await ready('bob');
            const envelope: PrivateEnvelope = await sealed('bob', TEAM.id, 'too late', ['alice', 'bob']);

            // When
            sendEnvelope('bob', envelope);
            of('alice').destroy();
            await applied();

            // Then
            expect(linesOf('alice')).toEqual([]);
        });

        test('should apply nothing once destroyed while reading the messages waiting for their conversation', async () => {
            // Given: the key pair of Alice read late, the messages of Bob waiting for their conversation
            let release: () => void = () => undefined;
            const held = new Promise<void>((resolve: () => void) => {
                release = resolve;
            });
            const agreementKeyPairOf = vi.fn(async (name: string): Promise<CryptoKeyPair> => {
                await held;
                return new ParticipantKeyStore(factory).agreementKeyPairOf(name);
            });
            const alice: PrivateConversations = page('alice', TestHelper.cast<ParticipantKeyStore>({ agreementKeyPairOf }));
            await publish('alice');
            await publish('bob');
            sendEnvelope('bob', await sealed('bob', TEAM.id, 'see example.com', ['alice', 'bob']));
            sendEnvelope('bob', await sealed('bob', TEAM.id, 'hello', ['alice', 'bob']));
            await applied();
            alice.declare([TEAM]);
            await eventually(() => expect(agreementKeyPairOf).toHaveBeenCalledWith('alice'));

            // When
            alice.destroy();
            release();
            await applied();

            // Then
            expect(linesOf('alice')).toEqual([]);
            expect(hub.reports).toEqual([]);
        });

        test('should apply nothing once destroyed while decrypting a message', async () => {
            // Given
            pagesOf(['alice']);
            await publish('bob');
            await eventually(() => expect(messagesOf(PrivateMessengerType.KEY, 'alice')).toHaveLength(1));
            await applied();
            let release: () => void = () => undefined;
            const held = new Promise<void>((resolve: () => void) => {
                release = resolve;
            });
            const decrypt: SubtleCrypto['decrypt'] = crypto.subtle.decrypt.bind(crypto.subtle);
            const decrypting = vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args: Parameters<SubtleCrypto['decrypt']>) => {
                await held;
                return decrypt(...args);
            });
            sendEnvelope('bob', await sealed('bob', TEAM.id, 'see example.com', ['alice', 'bob']));
            await eventually(() => expect(decrypting).toHaveBeenCalled());

            // When
            of('alice').destroy();
            release();
            await applied();

            // Then
            expect(linesOf('alice')).toEqual([]);
            expect(hub.reports).toEqual([]);
        });

        test('should publish no key once destroyed while reading it', async () => {
            // Given
            let resolve: (pair: CryptoKeyPair) => void = () => undefined;
            const agreementKeyPairOf = vi.fn(() => new Promise<CryptoKeyPair>((resolved: (pair: CryptoKeyPair) => void) => {
                resolve = resolved;
            }));
            const alice: PrivateConversations = page('alice', TestHelper.cast<ParticipantKeyStore>({ agreementKeyPairOf }));
            alice.declare([TEAM]);
            await eventually(() => expect(agreementKeyPairOf).toHaveBeenCalledWith('alice'));

            // When
            alice.destroy();
            resolve(await ParticipantKeyStore.generateAgreementKeyPair());
            await applied();

            // Then
            expect(messagesOf(PrivateMessengerType.KEY)).toEqual([]);
        });
    });

    test('should go on applying the messages after a failure', async () => {
        // Given
        const broken: PrivateConversations = page('zoe', TestHelper.cast<ParticipantKeyStore>({ agreementKeyPairOf: () => Promise.reject(new Error('broken')) }));

        // When
        broken.declare([{ ...TEAM, members: ['zoe', 'bob'] }]);
        await applied();
        await publish('bob');
        await applied();

        // Then
        expect(TimedLogger.error).toHaveBeenCalledWith('Failed to apply a change of the private conversations', expect.any(Error));
        expect(broken.mine()[0].missingKeys).toEqual(['zoe']);
    });
});
