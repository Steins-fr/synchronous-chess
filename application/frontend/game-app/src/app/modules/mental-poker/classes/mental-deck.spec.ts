import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomHub } from '@testing/room-hub';
import { TestHelper } from '@testing/test.helper';
import { TEST_GROUP } from '@testing/sra-test-group';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CardKey, CardKeysMessage, DeckStepMessage, mentalDeckBlockChains, MentalDeckMessageType, MentalDeckPayloads } from '../mental-deck-messages';
import { DeckKeyStore } from './deck-key-store';
import { DeckVerification, MentalDeck } from './mental-deck';
import { MentalDeckTable } from './mental-deck-table';
import { DeckPhase } from './mental-deck-state';
import { SraCipher } from './sra-cipher';

const SIZE: number = 17;
const ID: string = 'game:1';
const cipher = new SraCipher(TEST_GROUP);
const hand = (from: number): number[] => Array.from({ length: 5 }, (_, index: number) => from + index);

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing a message of a type */
function tampering(type: MentalDeckMessageType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

describe('MentalDeck', () => {
    let hub: RoomHub<MentalDeckPayloads>;
    let rooms: Map<string, Room<MentalDeckPayloads>>;
    let tables: Map<string, MentalDeckTable>;
    let decks: MentalDeck[];

    /** The page of a participant: its room and the table of its game */
    function page(name: string, tamper?: Tamper): MentalDeckTable {
        const room: Room<MentalDeckPayloads> = hub.room(name, tamper);
        rooms.set(name, room);
        tables.set(name, new MentalDeckTable(room));
        return tables.get(name) as MentalDeckTable;
    }

    function deck(name: string, players: ReadonlyArray<string>, tamper?: Tamper): MentalDeck {
        const created: MentalDeck = page(name, tamper).deck({ id: ID, size: SIZE, players, cipher });
        decks.push(created);
        return created;
    }

    /** The page of a player loaded again: a new deck, the former page closed */
    function reload(index: number, name: string): MentalDeck {
        tables.get(name)?.destroy();
        hub.close(rooms.get(name) as Room<MentalDeckPayloads>);
        const reloaded: MentalDeck = deck(name, ['a', 'b']);
        decks.splice(index, 1, decks.pop() as MentalDeck);
        return reloaded;
    }

    /** The players a and b, and the spectator c */
    function table(tampers: { a?: Tamper; b?: Tamper } = {}): [MentalDeck, MentalDeck, MentalDeck] {
        return [deck('a', ['a', 'b'], tampers.a), deck('b', ['a', 'b'], tampers.b), deck('c', ['a', 'b'])];
    }

    async function ready(...ofDecks: MentalDeck[]): Promise<void> {
        await vi.waitFor(() => ofDecks.forEach((of: MentalDeck) => expect(of.phase()).toEqual(DeckPhase.READY)));
    }

    /** Deals the cards on every participant, as the game does when its message applies */
    function deal(positions: ReadonlyArray<number>, recipient: string, ofDecks: ReadonlyArray<MentalDeck> = decks): Promise<void[]> {
        return Promise.all(ofDecks.map((of: MentalDeck) => of.deal(positions, recipient)));
    }

    function open(positions: ReadonlyArray<number>, ofDecks: ReadonlyArray<MentalDeck> = decks): Promise<ReadonlyArray<ReadonlyMap<number, number | undefined>>> {
        return Promise.all(ofDecks.map((of: MentalDeck) => of.open(positions)));
    }

    function disclose(ofDecks: ReadonlyArray<MentalDeck> = decks): Promise<DeckVerification[]> {
        return Promise.all(ofDecks.map((of: MentalDeck) => of.disclose()));
    }

    function messagesOf(type: MentalDeckMessageType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<MentalDeckPayloads>();
        rooms = new Map();
        tables = new Map();
        decks = [];
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        tables.forEach((table: MentalDeckTable) => table.destroy());
        vi.restoreAllMocks();
    });

    test('should route its messages to the chain of its game', () => {
        expect(mentalDeckBlockChains(BlockChainName.CHESS)).toEqual({
            [MentalDeckMessageType.SHUFFLE]: BlockChainName.CHESS,
            [MentalDeckMessageType.LOCK]: BlockChainName.CHESS,
            [MentalDeckMessageType.KEYS]: BlockChainName.CHESS,
            [MentalDeckMessageType.DISCLOSE]: BlockChainName.CHESS,
        });
    });

    test('should be shuffled then locked by each player in turn, waiting for each one', async () => {
        // When
        const [a, b, c] = table();

        // Then
        expect(c.waitingFor()).toEqual(['a']);
        expect(c.players).toEqual(['a', 'b']);
        await ready(a, b, c);
        expect(hub.types()).toEqual([MentalDeckMessageType.SHUFFLE, MentalDeckMessageType.SHUFFLE, MentalDeckMessageType.LOCK, MentalDeckMessageType.LOCK]);
        expect(hub.delivered.map((message: AppMessage) => message.from)).toEqual(['a', 'b', 'a', 'b']);
        expect(c.waitingFor()).toEqual([]);
        expect(hub.reports).toEqual([]);
    });

    test('should deal the cards to their recipient only, from a deck holding each card once', async () => {
        // Given
        const [a, b, c] = table();

        // When dealt before the deck is ready
        const dealt: Promise<void[][]> = Promise.all([deal(hand(0), 'a'), deal(hand(5), 'b')]);
        await ready(a, b, c);
        await dealt;

        // Then the players gave the keys of the cards of the other one, in one message each
        expect(messagesOf(MentalDeckMessageType.KEYS).map((message: AppMessage) => [message.from, (message.payload as CardKeysMessage).keys.map(({ position }) => position)]).sort())
            .toEqual([['a', hand(5)], ['b', hand(0)]]);
        expect([...a.cards().keys()]).toEqual(hand(0));
        expect([...b.cards().keys()]).toEqual(hand(5));
        expect(c.cards().size).toEqual(0);
        expect(new Set([...a.cards().values(), ...b.cards().values()]).size).toEqual(10);
        expect(c.waitingFor()).toEqual([]);
    });

    test('should open the cards to everyone, dealt or not', async () => {
        // Given
        const [a, b, c] = table();
        await deal(hand(0), 'a');
        hub.delivered.length = 0;

        // When
        const opened = await open([0, 16]);

        // Then a gives its key of its card, both players their key of the other one
        expect(messagesOf(MentalDeckMessageType.KEYS).map((message: AppMessage) => message.from).sort()).toEqual(['a', 'b']);
        expect(opened[0]).toEqual(new Map([[0, a.cards().get(0)], [16, b.cards().get(16)]]));
        expect(opened[1]).toEqual(opened[0]);
        expect(opened[2]).toEqual(opened[0]);
        expect(c.cards()).toEqual(opened[0]);
    });

    test('should be played by 4 players, each one reading its cards only', async () => {
        // Given
        const players: ReadonlyArray<string> = ['a', 'b', 'c', 'd'];
        const all: MentalDeck[] = players.map((name: string) => deck(name, players));

        // When
        await Promise.all(players.map((name: string, index: number) => deal([index * 2, index * 2 + 1], name)));
        const [opened] = await open([16]);

        // Then
        players.forEach((name: string, index: number) => expect([...all[index].cards().keys()]).toEqual([index * 2, index * 2 + 1, 16]));
        expect(new Set(all.flatMap((of: MentalDeck) => [...of.cards().values()])).size).toEqual(9);
        expect(opened.get(16)).toEqual(all[0].cards().get(16));
        expect(messagesOf(MentalDeckMessageType.SHUFFLE).map((message: AppMessage) => message.from)).toEqual(players);
    });

    test('should be checked once every player disclosed its keys, then show every card', async () => {
        // Given
        const [a, , c] = table();
        await Promise.all([deal(hand(0), 'a'), deal(hand(5), 'b')]);
        const cardsOfA: ReadonlyMap<number, number> = a.cards();
        new DeckKeyStore('room', 'a').save('game:2', { shuffleKey: '1', permutation: [], cardKeys: [] });

        // When
        const verifications: Promise<DeckVerification[]> = disclose();

        // Then
        expect(c.waitingFor()).toEqual(['a', 'b']);
        expect(await verifications).toEqual([DeckVerification.FAIR, DeckVerification.FAIR, DeckVerification.FAIR]);
        expect(await a.disclose()).toEqual(DeckVerification.FAIR);
        expect(messagesOf(MentalDeckMessageType.DISCLOSE).map((message: AppMessage) => message.from).sort()).toEqual(['a', 'b']);
        expect(c.verification()).toEqual(DeckVerification.FAIR);
        expect(hub.reports).toEqual([]);
        await vi.waitFor(() => expect(c.cards().size).toEqual(SIZE));
        expect(new Set(c.cards().values()).size).toEqual(SIZE);
        hand(0).forEach((position: number) => expect(c.cards().get(position)).toEqual(cardsOfA.get(position)));
        // The secrets of the deck are not secret anymore, the ones of another deck are kept
        expect(new DeckKeyStore('room', 'a').get(ID)).toBeUndefined();
        expect(new DeckKeyStore('room', 'a').get('game:2')).toBeDefined();
    });

    describe('cheats', () => {
        test('should report a key not giving its card: its recipient at once, everyone once disclosed', async () => {
            // Given b gives a wrong key of a card of a
            const [a, b, c] = table({ b: tampering(MentalDeckMessageType.KEYS, (payload: CardKeysMessage) => ({ ...payload, keys: payload.keys.map(({ position }) => ({ position, key: '2' })) })) });

            // When
            await deal(hand(0), 'a');

            // Then a can not read its cards, and tells it
            expect(a.cards().size).toEqual(0);
            expect(hub.reported()).toEqual(Array.from({ length: 5 }, () => `a ${ CheatReason.INVALID_CARD_KEY } b`));
            hub.reports.length = 0;

            // When
            expect(await disclose()).toEqual([DeckVerification.CHEATED, DeckVerification.CHEATED, DeckVerification.CHEATED]);

            // Then everyone reports the message of b
            expect(hub.reported().sort()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_CARD_KEY } b`));
            expect(hub.reports.every(([, message]) => message === messagesOf(MentalDeckMessageType.KEYS, 'b')[0])).toEqual(true);
            expect([a.verification(), b.verification(), c.verification()]).toEqual([DeckVerification.CHEATED, DeckVerification.CHEATED, DeckVerification.CHEATED]);
        });

        test('should not tell which key is wrong for a card read with several other keys', async () => {
            // Given
            const players: ReadonlyArray<string> = ['a', 'b', 'c'];
            const [a] = [deck('a', players), deck('b', players, tampering(MentalDeckMessageType.KEYS, (payload: CardKeysMessage) => ({ ...payload, keys: payload.keys.map(({ position }) => ({ position, key: '2' })) }))), deck('c', players)];

            // When
            await deal([0], 'a');

            // Then
            expect(a.cards().size).toEqual(0);
            expect(hub.reports).toEqual([]);
        });

        test('should report a shuffle stacking the deck, its cards not being the previous ones', async () => {
            // Given b puts the cards in an order of its own, encrypted with a key of its own
            const key: bigint = cipher.randomKey();
            const [a, b, c] = table();
            vi.spyOn(TestHelper.cast<{ computeShuffle(): Promise<bigint[]> }>(b), 'computeShuffle')
                .mockResolvedValue(Array.from({ length: SIZE }, (_, card: number) => cipher.apply(cipher.encode(card), key)));
            await ready(a, b, c);

            // When
            expect(await disclose()).toEqual([DeckVerification.CHEATED, DeckVerification.CHEATED, DeckVerification.CHEATED]);

            // Then
            expect(hub.reported().sort()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_SHUFFLE } b`));
            expect(hub.reports[0][1]).toBe(messagesOf(MentalDeckMessageType.SHUFFLE, 'b')[0]);
        });

        test('should report a lock moving the cards', async () => {
            // Given
            const [a, b, c] = table();
            const lock = TestHelper.cast<{ computeLock(...args: unknown[]): Promise<bigint[]> }>(a);
            const computeLock = lock.computeLock.bind(a);
            vi.spyOn(lock, 'computeLock').mockImplementation(async (...args: unknown[]) => [...await computeLock(...args)].reverse());
            await ready(a, b, c);

            // When
            expect(await disclose()).toEqual([DeckVerification.CHEATED, DeckVerification.CHEATED, DeckVerification.CHEATED]);

            // Then
            expect(hub.reported().sort()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_SHUFFLE } a`));
            expect(hub.reports[0][1]).toBe(messagesOf(MentalDeckMessageType.LOCK, 'a')[0]);
        });

        test('should report a disclosure not giving the cards locked', async () => {
            // Given b discloses wrong keys of its cards
            const [a, b, c] = table({ b: tampering(MentalDeckMessageType.DISCLOSE, (payload: { cardKeys: string[] }) => ({ ...payload, cardKeys: payload.cardKeys.map(() => '2') })) });
            await ready(a, b, c);

            // When
            expect(await disclose()).toEqual([DeckVerification.CHEATED, DeckVerification.CHEATED, DeckVerification.CHEATED]);

            // Then the lock of b does not match its keys, and the cards read with them are none
            expect(hub.reported().sort()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_SHUFFLE } b`));
            expect(hub.reports[0][1]).toBe(messagesOf(MentalDeckMessageType.LOCK, 'b')[0]);
            expect(a.cards().size).toEqual(0);
        });

        test('should break on a deck holding a card twice, and fail its deals', async () => {
            // Given
            const [a, , c] = table({ b: tampering(MentalDeckMessageType.SHUFFLE, (payload: DeckStepMessage) => ({ ...payload, cards: payload.cards.map(() => payload.cards[0]) })) });

            // When
            const dealt: Promise<void> = c.deal(hand(0), 'a');

            // Then
            await expect(dealt).rejects.toThrow('The deck game:1 is broken');
            expect(c.phase()).toEqual(DeckPhase.BROKEN);
            expect(c.waitingFor()).toEqual([]);
            expect(hub.reported()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_SHUFFLE } b`));
            await expect(a.open([0])).rejects.toThrow('The deck game:1 is broken');
            expect(messagesOf(MentalDeckMessageType.LOCK)).toEqual([]);

            // When a broken deck receives the next step
            hub.send({ from: 'a', type: MentalDeckMessageType.LOCK, payload: { deck: ID, cards: [] } });

            // Then it is ignored, and the game does not wait for its disclosure
            expect(hub.reports).toHaveLength(3);
            expect(await c.disclose()).toEqual(DeckVerification.CHEATED);
            expect(c.verification()).toEqual(DeckVerification.CHEATED);
            expect(new DeckKeyStore('room', 'a').get(ID)).toBeUndefined();
        });

        test('should break on a deck holding a value that is not a square, a card marked to follow it', async () => {
            // Given b marks a card, its opposite being no square
            const key: bigint = cipher.randomKey();
            const [, b, c] = table();
            vi.spyOn(TestHelper.cast<{ computeShuffle(): Promise<bigint[]> }>(b), 'computeShuffle')
                .mockResolvedValue(Array.from({ length: SIZE }, (_, card: number) => {
                    const value: bigint = cipher.apply(cipher.encode(card), key);
                    return card === 0 ? TEST_GROUP.prime - value : value;
                }));

            // Then
            await vi.waitFor(() => expect(c.phase()).toEqual(DeckPhase.BROKEN));
            expect(hub.reported().sort()).toEqual(['a', 'b', 'c'].map((reporter: string) => `${ reporter } ${ CheatReason.INVALID_SHUFFLE } b`));
        });

        test.each([
            ['missing', (payload: DeckStepMessage) => ({ ...payload, cards: undefined })],
            ['too few', (payload: DeckStepMessage) => ({ ...payload, cards: payload.cards.slice(1) })],
            ['not in the group', (payload: DeckStepMessage) => ({ ...payload, cards: ['1', ...payload.cards.slice(1)] })],
        ])('should break on a deck whose cards are %s', async (_, change: (payload: DeckStepMessage) => unknown) => {
            // When
            const [, , c] = table({ a: tampering(MentalDeckMessageType.LOCK, change) });

            // Then
            await vi.waitFor(() => expect(c.phase()).toEqual(DeckPhase.BROKEN));
            expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_SHUFFLE } a`);
        });

        test('should report malformed keys and disclosures, and take the next ones', async () => {
            // Given
            const [a, , c] = table();
            const dealt: Promise<void[]> = Promise.all([c.deal(hand(0), 'a'), a.deal(hand(0), 'a')]);
            await ready(c);

            // When
            hub.send({ from: 'b', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [{ position: 0, key: 'zz' }] } });
            hub.send({ from: 'b', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: undefined } });
            hub.send({ from: 'b', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [TestHelper.cast<CardKey>(null)] } });
            hub.send({ from: 'b', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [{ position: SIZE, key: '1' }] } });
            c.disclose();
            hub.send({ from: 'b', type: MentalDeckMessageType.DISCLOSE, payload: { deck: ID, shuffleKey: '1', cardKeys: ['1'] } });
            hub.send({ from: 'b', type: MentalDeckMessageType.DISCLOSE, payload: { deck: ID, shuffleKey: 'zz', cardKeys: Array.from({ length: SIZE }, () => '1') } });
            hub.send({ from: 'b', type: MentalDeckMessageType.DISCLOSE, payload: { deck: ID, shuffleKey: '1', cardKeys: undefined } });

            // Then
            expect(hub.reported().filter((report: string) => report.startsWith('c'))).toEqual(Array.from({ length: 7 }, () => `c ${ CheatReason.INVALID_CARD_KEY } b`));
            // The keys of b come once b deals them too
            expect(c.waitingFor()).toEqual(['a', 'b']);
            void decks[1].deal(hand(0), 'a');
            await dealt;
            expect(a.cards().size).toEqual(5);
        });
    });

    test('should ignore the messages out of turn, of another deck, of a spectator, and the keys before the deck is ready', async () => {
        // Given
        const [a, b, c] = table();
        hub.send({ from: 'b', type: MentalDeckMessageType.SHUFFLE, payload: { deck: ID, cards: [] } });
        hub.send({ from: 'c', type: MentalDeckMessageType.SHUFFLE, payload: { deck: ID, cards: [] } });
        hub.send({ from: 'a', type: MentalDeckMessageType.DISCLOSE, payload: { deck: ID, shuffleKey: '1', cardKeys: [] } });
        hub.send({ from: 'a', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [{ position: 0, key: '1' }] } });
        await ready(a, b, c);

        // When
        hub.send({ from: 'a', type: MentalDeckMessageType.SHUFFLE, payload: { deck: 'game:2', cards: [] } });
        hub.send({ from: 'a', type: MentalDeckMessageType.SHUFFLE, payload: TestHelper.cast<DeckStepMessage>(null) });

        // Then
        expect(hub.reports).toEqual([]);
        await deal([0], 'a');
        expect(a.cards().size).toEqual(1);
    });

    test('should take the keys given before the game of the participant asks for them, its game being late', async () => {
        // Given the games of b and c deal the cards of a, its game later
        const [a, b, c] = table();
        await Promise.all([b.deal(hand(0), 'a'), c.deal(hand(0), 'a')]);

        // When
        await a.deal(hand(0), 'a');

        // Then
        expect(a.cards().size).toEqual(5);
        expect(messagesOf(MentalDeckMessageType.KEYS)).toHaveLength(1);

        // When b gives another key of a card, then a opens it
        hub.send({ from: 'b', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [{ position: 0, key: '2' }] } });
        const [opened] = await open([0], [a, b, c]);

        // Then its first key is final
        expect(opened.get(0)).toEqual(a.cards().get(0));
        expect(hub.reports).toEqual([]);
    });

    test('should take the disclosures given before the game of the participant asks for them, its game being late', async () => {
        // Given
        const [a, b, c] = table();
        await disclose([a, b]);

        // When
        const verification: DeckVerification = await c.disclose();

        // Then
        expect(verification).toEqual(DeckVerification.FAIR);
        expect(c.cards().size).toEqual(SIZE);
    });

    test('should refuse a deck not played by 2 different players at least', () => {
        expect(() => page('a').deck({ id: ID, size: SIZE, players: ['a', 'a'], cipher })).toThrow('A deck is played by 2 different players at least, not a, a');
        expect(() => page('b').deck({ id: ID, size: SIZE, players: ['b'], cipher })).toThrow('A deck is played by 2 different players at least, not b');
    });

    test('should give a deck the messages received before the game creates it', async () => {
        // Given the game of c is late, its deck not created yet
        const [a, b] = [deck('a', ['a', 'b']), deck('b', ['a', 'b'])];
        const late: MentalDeckTable = page('c');
        await ready(a, b);
        hub.send(TestHelper.cast<AppMessage>({ from: 'a', type: MentalDeckMessageType.KEYS, payload: { keys: [] } }));

        // When
        const c: MentalDeck = late.deck({ id: ID, size: SIZE, players: ['a', 'b'], cipher });

        // Then
        expect(c.phase()).toEqual(DeckPhase.READY);
        expect(() => late.deck({ id: ID, size: SIZE, players: ['a', 'b'], cipher })).toThrow('The deck game:1 exists already');

        // When the game destroys the deck, the table staying
        c.destroy();
        hub.send({ from: 'a', type: MentalDeckMessageType.KEYS, payload: { deck: ID, keys: [{ position: 0, key: 'zz' }] } });

        // Then
        expect(hub.reported()).toEqual(['a invalidCardKey a', 'b invalidCardKey a']);

        // When the game of a player destroys its deck, then asks for its disclosure
        a.destroy();
        void a.disclose();
        void b.disclose();

        // Then the destroyed deck sends nothing
        await vi.waitFor(() => expect(messagesOf(MentalDeckMessageType.DISCLOSE, 'b')).toHaveLength(1));
        expect(messagesOf(MentalDeckMessageType.DISCLOSE, 'a')).toEqual([]);
    });

    test('should refuse to deal to a spectator, or a card out of the deck', () => {
        // Given
        const [a] = table();

        // Then
        expect(() => a.deal([0], 'c')).toThrow('c plays no deck');
        expect(() => a.deal([SIZE], 'a')).toThrow(`No card at ${ SIZE }`);
        expect(() => a.open([0.5])).toThrow('No card at 0.5');
        expect(() => a.open([-1])).toThrow('No card at -1');
    });

    test('should stop with a failure, as a store throwing', async () => {
        // Given
        vi.spyOn(DeckKeyStore.prototype, 'get').mockImplementation(() => {
            throw new Error('store');
        });

        // When
        table();

        // Then
        await vi.waitFor(() => expect(TimedLogger.error).toHaveBeenCalledWith('The deck game:1 failed', new Error('store')));
    });

    test('should deal with the 2048-bit group by default', async () => {
        // Given
        const [a, b] = ['a', 'b'].map((name: string) => page(name).deck({ id: ID, size: SIZE, players: ['a', 'b'] }));

        // When
        await Promise.all([a, b].map((of: MentalDeck) => of.deal(hand(0), 'a')));

        // Then
        expect(a.cards().size).toEqual(5);
        expect((messagesOf(MentalDeckMessageType.SHUFFLE)[0].payload as DeckStepMessage).cards[0].length).toBeGreaterThan(500);
    }, 30_000);

    describe('reload', () => {
        test('should make the same deck again after a reload, sent again after the chain and ignored', async () => {
            // Given
            const [, b, c] = table();
            await Promise.all([deal(hand(0), 'a'), deal(hand(5), 'b')]);
            const cardsOfA: ReadonlyMap<number, number> = decks[0].cards();

            // When a reloads, its page shuffling the deck before the chain comes back, which comes first
            hub.hold('a');
            const a: MentalDeck = reload(0, 'a');
            await vi.waitFor(() => expect(hub.held).toHaveLength(1));
            const dealt: Promise<void[]> = Promise.all([a.deal(hand(0), 'a'), a.deal(hand(5), 'b')]);
            hub.replay(rooms.get('a') as Room<MentalDeckPayloads>);
            hub.release();
            await dealt;

            // Then it sent the same deck again, ignored, and no other step
            const [first, second] = messagesOf(MentalDeckMessageType.SHUFFLE, 'a');
            expect(second.payload).toEqual(first.payload);
            expect(messagesOf(MentalDeckMessageType.LOCK, 'a')).toHaveLength(1);
            expect(a.cards()).toEqual(cardsOfA);
            expect(await disclose([a, b, c])).toEqual([DeckVerification.FAIR, DeckVerification.FAIR, DeckVerification.FAIR]);
            expect(hub.reports).toEqual([]);
        });

        test('should neither shuffle nor tell its secrets lost after a reload of a deck checked, its messages waiting for the game', async () => {
            // Given a deck checked, its secrets removed
            table();
            await disclose();
            const sent: number = hub.delivered.length;

            // When a reloads, the chain coming back before its game creates the deck
            tables.get('a')?.destroy();
            hub.close(rooms.get('a') as Room<MentalDeckPayloads>);
            const late: MentalDeckTable = page('a');
            hub.replay(rooms.get('a') as Room<MentalDeckPayloads>);
            const a: MentalDeck = late.deck({ id: ID, size: SIZE, players: ['a', 'b'], cipher });

            // Then
            expect(a.phase()).toEqual(DeckPhase.READY);
            await vi.waitFor(() => expect(a.verification()).toEqual(DeckVerification.FAIR));
            expect(a.cards().size).toEqual(SIZE);
            expect(hub.delivered).toHaveLength(sent);
            expect(TimedLogger.warn).not.toHaveBeenCalled();
        });

        test('should read its cards again after a reload, without sending anything again', async () => {
            // Given
            table();
            await Promise.all([deal(hand(0), 'a'), deal(hand(5), 'b')]);
            const cardsOfA: ReadonlyMap<number, number> = decks[0].cards();
            const sent: number = hub.delivered.length;

            // When the chain comes back before the page made its deck
            const a: MentalDeck = reload(0, 'a');
            const dealt: Promise<void[]> = Promise.all([a.deal(hand(0), 'a'), a.deal(hand(5), 'b')]);
            hub.replay(rooms.get('a') as Room<MentalDeckPayloads>);
            await dealt;

            // Then
            expect(a.cards()).toEqual(cardsOfA);
            expect(hub.delivered).toHaveLength(sent);

            // When the game opens a card of a
            const [opened] = await open([0]);

            // Then
            expect(opened.get(0)).toEqual(cardsOfA.get(0));
        });

        test('should give no key once its secrets stored are not ones', async () => {
            // Given
            table();
            await ready(...decks);
            new DeckKeyStore('room', 'b').save(ID, { shuffleKey: 'zz', permutation: [], cardKeys: [] });

            // When
            const b: MentalDeck = reload(1, 'b');
            hub.replay(rooms.get('b') as Room<MentalDeckPayloads>);
            void deal(hand(0), 'a');

            // Then
            await vi.waitFor(() => expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the deck game:1 are lost, its cards can not be read'));
            expect(messagesOf(MentalDeckMessageType.KEYS, 'b')).toEqual([]);
            expect(b.cards().size).toEqual(0);
        });

        test('should give no key once its secrets are lost, its new ones not making its deck in the chain', async () => {
            // Given
            table();
            await deal(hand(0), 'b');
            sessionStorage.clear();

            // When
            const a: MentalDeck = reload(0, 'a');
            void a.deal(hand(0), 'b');
            hub.replay(rooms.get('a') as Room<MentalDeckPayloads>);
            void deal(hand(5), 'b');

            // Then
            await vi.waitFor(() => expect(TimedLogger.warn).toHaveBeenCalledWith('The keys of the deck game:1 are lost, its cards can not be read'));
            await deal(hand(10), 'a', decks.filter((of: MentalDeck) => of !== a));
            expect(a.cards().size).toEqual(0);
            expect(TimedLogger.warn).toHaveBeenCalledOnce();
            expect(messagesOf(MentalDeckMessageType.KEYS, 'a').map((message: AppMessage) => (message.payload as CardKeysMessage).keys.map(({ position }) => position)))
                .toEqual([hand(0)]);
            expect(new DeckKeyStore('room', 'a').get(ID)).toBeUndefined();
        });

        test('should not lock the deck once its secrets are lost, nor disclose them', async () => {
            // Given the lock of a waits, a page reloading before it is in the chain
            hub.hold('a');
            const [, b, c] = table();
            await vi.waitFor(() => expect(hub.held).toHaveLength(1));
            hub.release();
            hub.hold('a');
            await vi.waitFor(() => expect(hub.held).toHaveLength(1));
            sessionStorage.clear();

            // When
            const a: MentalDeck = reload(0, 'a');
            hub.replay(rooms.get('a') as Room<MentalDeckPayloads>);
            void disclose([a, b, c]);

            // Then
            await vi.waitFor(() => expect(TimedLogger.warn).toHaveBeenCalledOnce());
            expect(a.phase()).toEqual(DeckPhase.LOCKING);
            expect(c.waitingFor()).toEqual(['a']);
            expect(hub.held).toHaveLength(1);
        });

        test('should give no key once its secrets are lost, nor disclose them, and read the cards opened like the others', async () => {
            // Given
            table();
            await deal(hand(0), 'a');
            const cardsOfA: ReadonlyMap<number, number> = decks[0].cards();
            sessionStorage.clear();

            // When b reloads, not shuffling first: the chain comes back before its turn
            const b: MentalDeck = reload(1, 'b');
            void b.deal(hand(0), 'a');
            hub.replay(rooms.get('b') as Room<MentalDeckPayloads>);
            const [, opened] = await open([0]);

            // Then b reads the card opened with the keys of the chain
            expect(opened.get(0)).toEqual(cardsOfA.get(0));
            expect(TimedLogger.warn).not.toHaveBeenCalled();

            // When
            void deal([10], 'a');
            void disclose();

            // Then
            await vi.waitFor(() => expect(TimedLogger.warn).toHaveBeenCalledOnce());
            await vi.waitFor(() => expect(messagesOf(MentalDeckMessageType.DISCLOSE)).toHaveLength(1));
            expect(messagesOf(MentalDeckMessageType.KEYS, 'b')).toHaveLength(1);
            expect(messagesOf(MentalDeckMessageType.DISCLOSE, 'b')).toEqual([]);
            // The keys of the cards of a are all in the chain, once a disclosed its own
            await vi.waitFor(() => expect([...b.cards().keys()]).toEqual(hand(0)));
        });
    });
});
