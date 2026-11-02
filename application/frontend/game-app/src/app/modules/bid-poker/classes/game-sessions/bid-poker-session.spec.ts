import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BidEventKind, BidPokerGame, BidPokerPhase, MissedReason } from '../rules/bid-poker-game';
import { BID_POKER_RULES, BidPokerRules } from '../rules/bid-poker-rules';
import { bidPokerBlockChains, BidPokerPayloads, BPGameSessionType } from './bid-poker-messages';
import { BidPokerSession } from './bid-poker-session';

/** Three lots of 5 cards and a single change session: the specs play a game to its end quickly */
const LIGHT: BidPokerRules = { ...BID_POKER_RULES, deck: BID_POKER_RULES.deck.slice(0, 15), lotSizes: [5], changeSessions: 1 };
const PLAYERS: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 200_000;

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing the messages of a type */
function tampering(type: BPGameSessionType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

describe('BidPokerSession', { timeout: 30_000 }, () => {
    let hub: RoomHub<BidPokerPayloads>;
    let rooms: Map<string, Room<BidPokerPayloads>>;
    let sessions: Map<string, BidPokerSession>;

    function page(name: string, tamper?: Tamper): BidPokerSession {
        const room: Room<BidPokerPayloads> = hub.room(name, tamper);
        const session = new BidPokerSession(room, { rules: LIGHT });
        rooms.set(name, room);
        sessions.set(name, session);
        return session;
    }

    const of = (name: string): BidPokerSession => sessions.get(name) as BidPokerSession;
    const gameOf = (name: string): BidPokerGame => of(name).game() as BidPokerGame;

    /** Waits until every page passes the check */
    async function settled(check: (session: BidPokerSession) => boolean): Promise<void> {
        await eventually(() => sessions.forEach((session: BidPokerSession) => expect(check(session)).toBe(true)));
    }

    /** Alice, Bob, Carol and Dave seated in that order, Eve watching */
    async function seated(tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        PLAYERS.forEach((name: string) => page(name, tampers[name]));
        page('eve');
        PLAYERS.forEach((name: string, seat: number) => of(name).takeSeat(seat));
        await settled((session: BidPokerSession) => session.players().length === PLAYERS.length);
    }

    /** The players seated, Alice starts the game: every page draws the same catalogue */
    async function started(tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        await seated(tampers);
        await of('alice').start();
        await settled((session: BidPokerSession) => session.game() !== null);
    }

    /** Each player bids its amount on the lot, none for undefined, then every page applies the result of the lot */
    async function auction(amounts: ReadonlyArray<number | undefined>): Promise<void> {
        const events: number = gameOf('eve').events().length;
        await Promise.all(amounts.map((amount: number | undefined, player: number) => amount === undefined ? undefined : of(PLAYERS[player]).bid(amount)));
        await settled((session: BidPokerSession) => (session.game()?.events().length ?? 0) > events);
    }

    /** The dealing session: player i buys lot i for 10 coins */
    async function dealt(): Promise<void> {
        for (let lot = 0; lot < 3; lot++) {
            await auction(PLAYERS.map((_, player: number) => player === lot ? 10 : 0));
        }
        await settled((session: BidPokerSession) => session.game()?.phase() === BidPokerPhase.DISCARDING);
    }

    function messagesOf(type: BPGameSessionType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    /** A claim of a timeout, at a time of the chain */
    function claim(name: string, at: number = LATER): void {
        hub.time = at;
        of(name).claimTimeout();
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<BidPokerPayloads>();
        rooms = new Map();
        sessions = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: BidPokerSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should play the rules of the manga by default', () => {
        expect(new BidPokerSession(hub.room('zoe')).rules).toBe(BID_POKER_RULES);
    });

    test('should route every message of the game to its chain', () => {
        expect(Object.keys(bidPokerBlockChains)).toEqual(Object.values(BPGameSessionType));
        expect(new Set(Object.values(bidPokerBlockChains))).toEqual(new Set([BlockChainName.BID_POKER]));
    });

    describe('the start', () => {
        test('should let a seated player start once 4 players are seated, every page drawing the same catalogue', async () => {
            // Given
            PLAYERS.forEach((name: string) => page(name));
            page('eve');
            PLAYERS.slice(0, 3).forEach((name: string, seat: number) => of(name).takeSeat(seat * 2));
            await settled((session: BidPokerSession) => session.players().length === 3);

            // Then nobody starts, bids nor discards
            expect([of('alice').canStart(), of('alice').myBid(), of('alice').myDiscards(), of('eve').awaited()]).toEqual([false, null, null, []]);
            await of('alice').start();
            await of('alice').bid(1);
            await of('alice').discard([]);
            expect(hub.delivered).toHaveLength(3);

            // When
            of('dave').takeSeat(7);
            await settled((session: BidPokerSession) => session.players().length === 4);

            // Then
            expect([of('alice').canStart(), of('eve').canStart()]).toEqual([true, false]);
            expect(of('eve').players()).toEqual(PLAYERS);
            expect([of('alice').started(), of('alice').seatsOpen(), of('alice').inMatch()]).toEqual([false, true, false]);

            // When
            await of('alice').start();

            // Then the seats close at once, the players draw the deck
            await settled((session: BidPokerSession) => session.started());
            expect([of('bob').seatsOpen(), of('bob').inMatch(), of('eve').inMatch()]).toEqual([false, true, false]);
            await settled((session: BidPokerSession) => session.game() !== null);
            expect(messagesOf(BPGameSessionType.DRAW)).toHaveLength(8);
            const lots: unknown = gameOf('eve').lots();
            sessions.forEach((session: BidPokerSession) => expect(session.game()?.lots()).toEqual(lots));
            expect(gameOf('eve').lots().map(({ cards }) => cards.length)).toEqual([5, 5, 5]);
            expect([of('eve').step(), of('eve').awaited(), of('eve').phaseTime()]).toEqual([2, PLAYERS, LIGHT.catalogueTime + LIGHT.bidTime]);
            expect(of('eve').catalogues()).toEqual(1);
            expect(hub.reports).toEqual([]);

            // When a page sends its part again, the deck drawn
            hub.send(messagesOf(BPGameSessionType.DRAW, 'bob')[1]);
            await of('eve').bid(5);
            await of('alice').discard([]);

            // Then
            expect([of('eve').game(), of('alice').myDiscards()]).toEqual([gameOf('eve'), null]);
            expect(gameOf('eve').committed()).toEqual([]);
        });

        test('should wait for the random parts of the players while drawing the deck', async () => {
            // Given
            await seated();
            hub.hold('dave');

            // When
            await of('alice').start();
            await settled((session: BidPokerSession) => session.awaited().length === 1);

            // Then
            expect([of('eve').awaited(), of('eve').step(), of('eve').phaseTime()]).toEqual([['dave'], 0, LIGHT.drawTime]);

            // When
            hub.release();

            // Then
            await settled((session: BidPokerSession) => session.game() !== null);
        });

        test('should wait for a random part its page lost, its storage blocked', async () => {
            // Given
            await seated();
            hub.hold('dave');
            await of('alice').start();
            await settled((session: BidPokerSession) => session.awaited().length === 1);
            const getItem = Storage.prototype.getItem;
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string): string | null {
                if (key.endsWith(':dave')) {
                    throw new Error('blocked');
                }
                return getItem.call(this, key);
            });

            // When
            hub.release();

            // Then
            await eventually(() => expect(messagesOf(BPGameSessionType.DRAW, 'dave')).toHaveLength(1));
            await settled((session: BidPokerSession) => session.awaited().join() === 'dave');
            expect(of('eve').game()).toBeNull();
        });

        test('should ignore a start naming other players than the seated ones, or fewer than 4', async () => {
            // Given
            await seated();

            // When
            hub.send({ from: 'alice', type: BPGameSessionType.DRAW, payload: { game: 0, attempt: 0, players: ['alice', 'bob', 'carol'], commitment: 'c'.repeat(64) } });
            hub.send({ from: 'alice', type: BPGameSessionType.DRAW, payload: { game: 0, attempt: 0, commitment: 'c'.repeat(64) } });
            hub.send({ from: 'eve', type: BPGameSessionType.DRAW, payload: { game: 0, attempt: 0, players: PLAYERS, commitment: 'c'.repeat(64) } });
            hub.send({ from: 'alice', type: BPGameSessionType.DRAW, payload: { game: 1, attempt: 0, players: PLAYERS, commitment: 'c'.repeat(64) } });
            await of('alice').start();
            await settled((session: BidPokerSession) => session.game() !== null);

            // Then
            expect(of('eve').players()).toEqual(PLAYERS);
            expect(of('alice').canStart()).toBe(false);
        });

        test('should report a malformed commitment of the draw, and a random part not matching its commitment', async () => {
            // Given
            await seated({
                bob: tampering(BPGameSessionType.DRAW, (payload: { commitment?: string; part?: string }) =>
                    payload.part === undefined ? payload : { ...payload, part: 'not mine' }),
            });

            // When
            await of('alice').start();
            hub.send({ from: 'carol', type: BPGameSessionType.DRAW, payload: { game: 0, attempt: 0, commitment: 'malformed' } });
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } bob`));

            // Then the draw waits for the part of Bob
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } carol`);
            expect(of('eve').awaited()).toEqual(['bob']);
            expect(of('eve').game()).toBeNull();
        });
    });

    describe('an auction', () => {
        test('should sell the lot to the highest bid, no bid revealed before every bidder committed', async () => {
            // Given
            await started();

            // When
            await of('bob').bid(30);

            // Then the bid of Bob stays sealed
            expect([of('bob').myBid(), of('bob').canBid(), of('alice').canBid(), of('eve').canBid()]).toEqual([30, false, true, false]);
            await settled((session: BidPokerSession) => session.game()?.committed().length === 1);
            expect(messagesOf(BPGameSessionType.REVEAL)).toEqual([]);
            expect(of('eve').awaited()).toEqual(['alice', 'carol', 'dave']);

            // When the reveal of Bob waits, the others reveal theirs
            hub.hold('bob');
            await Promise.all([of('alice').bid(12), of('carol').bid(0), of('dave').bid(29)]);
            await eventually(() => expect(messagesOf(BPGameSessionType.REVEAL)).toHaveLength(3));
            hub.release();
            await settled((session: BidPokerSession) => (session.game()?.events().length ?? 0) > 0);

            // Then
            expect(gameOf('eve').events()[0]).toMatchObject({ kind: BidEventKind.SOLD, winner: 1, price: 30 });
            const types: string[] = hub.types();
            expect(types.indexOf(BPGameSessionType.REVEAL)).toBeGreaterThan(types.lastIndexOf(BPGameSessionType.COMMIT));
            expect(gameOf('eve').coins()).toEqual([300, 270, 300, 300]);
            expect(of('eve').liveEvents()).toEqual(1);
            expect(hub.reports).toEqual([]);
            expect(sessionStorage.getItem('synchronous-chess:sealed-bids:room:bob')).toEqual('{}');
        });

        test('should sell the lot to the first commitment in the chain of the equal highest bids', async () => {
            // Given
            await started();
            hub.hold('alice');

            // When Alice bids first, her commitment ordered after the one of Bob
            await of('alice').bid(20);
            await of('bob').bid(20);
            await settled((session: BidPokerSession) => session.game()?.committed().length === 1);
            hub.release();
            await auction([undefined, undefined, 0, 0]);

            // Then
            expect(gameOf('eve').events()[0]).toMatchObject({ kind: BidEventKind.SOLD, winner: 1, price: 20, tied: [0] });
        });

        test('should take out of the game a lot nobody bids on', async () => {
            // Given
            await started();

            // When
            await auction([0, 0, 0, 0]);

            // Then
            expect(gameOf('eve').events()[0]).toEqual({ kind: BidEventKind.UNSOLD, session: 0, lot: 0, seller: null });
            expect(gameOf('eve').out()).toHaveLength(5);
        });

        test('should report a bid above the coins of its player, counted as none', async () => {
            // Given
            await started();

            // When
            await auction([400, 5, 0, 0]);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } alice`);
            expect(gameOf('eve').events().at(-1)).toMatchObject({ kind: BidEventKind.SOLD, winner: 1, price: 5 });
        });

        test('should report a bid revealed otherwise than committed, counted as none', async () => {
            // Given
            await started({ alice: tampering(BPGameSessionType.REVEAL, (payload: object) => ({ ...payload, amount: 1 })) });

            // When
            await auction([50, 5, 0, 0]);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } alice`);
            expect(gameOf('eve').events()).toEqual([
                { kind: BidEventKind.MISSED, session: 0, lot: 0, phase: BidPokerPhase.REVEALING, reason: MissedReason.INVALID, players: [0] },
                expect.objectContaining({ kind: BidEventKind.SOLD, winner: 1, price: 5 }),
            ]);
        });

        test.each([
            { name: 'a salt missing', change: (payload: object) => ({ ...payload, salt: undefined }) },
            { name: 'an amount of text', change: (payload: object) => ({ ...payload, amount: '50' }) },
        ])('should report a reveal with $name', async ({ change }) => {
            // Given
            await started({ alice: tampering(BPGameSessionType.REVEAL, change) });

            // When
            await auction([50, 5, 0, 0]);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } alice`);
        });

        test('should report a malformed commitment, and ignore the commitments of another lot, session or game, or of a spectator', async () => {
            // Given
            await started();

            // When
            hub.send({ from: 'alice', type: BPGameSessionType.COMMIT, payload: { game: 0, attempt: 0, session: 0, lot: 0, commitment: 'malformed' } });
            [{ lot: 1 }, { session: 1 }, { game: 1 }, { attempt: 1 }, { lot: null }].forEach((change: object) =>
                hub.send({ from: 'alice', type: BPGameSessionType.COMMIT, payload: { game: 0, attempt: 0, session: 0, lot: 0, commitment: 'c'.repeat(64), ...change } }));
            hub.send({ from: 'eve', type: BPGameSessionType.COMMIT, payload: { game: 0, attempt: 0, session: 0, lot: 0, commitment: 'c'.repeat(64) } });
            hub.send({ from: 'eve', type: BPGameSessionType.REVEAL, payload: { game: 0, attempt: 0, session: 0, lot: 0, amount: 1, salt: 's' } });
            hub.send({ from: 'alice', type: BPGameSessionType.DISCARD, payload: { game: 0, attempt: 0, session: 0, cards: [], salt: 's' } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } alice`));
            expect(gameOf('eve').committed()).toEqual([]);
        });
    });

    describe('a change session', () => {
        test('should auction the discards of each player, sealed until every player committed, the coins to the seller', async () => {
            // Given
            await started();
            await dealt();
            const held: ReadonlyArray<number> = gameOf('alice').holdings()[0];

            // Then
            expect([of('alice').canDiscard(), of('dave').canDiscard(), of('eve').canDiscard()]).toEqual([true, false, false]);

            // When
            await of('alice').discard([held[3], held[0]]);

            // Then
            expect([of('alice').myDiscards(), of('alice').canDiscard()]).toEqual([[held[3], held[0]], false]);
            await settled((session: BidPokerSession) => session.game()?.committed().length === 1);
            expect(messagesOf(BPGameSessionType.DISCARD)).toEqual([]);

            // When
            await of('bob').discard([]);
            await of('carol').discard([]);
            await settled((session: BidPokerSession) => session.game()?.phase() === BidPokerPhase.BIDDING);

            // Then
            expect(gameOf('eve').lot()).toEqual({ index: 0, cards: [held[3], held[0]], seller: 0 });

            // When
            await auction([undefined, 4, 0, 6]);

            // Then the game is over
            expect(gameOf('eve').coins()).toEqual([296, 290, 290, 294]);
            await settled((session: BidPokerSession) => session.over());
            expect([of('alice').seatsOpen(), of('alice').inMatch()]).toEqual([true, false]);
            expect(hub.reports).toEqual([]);
        });

        test('should report a seller bidding on its own lot, and a discard of a card its player does not hold', async () => {
            // Given
            await started({ bob: tampering(BPGameSessionType.DISCARD, (payload: object) => ({ ...payload, cards: [99] })) });
            await dealt();
            await of('alice').discard([gameOf('alice').holdings()[0][0]]);
            await of('bob').discard([0]);
            await of('carol').discard([99]);
            await settled((session: BidPokerSession) => session.game()?.phase() === BidPokerPhase.BIDDING);

            // When
            hub.send({ from: 'alice', type: BPGameSessionType.COMMIT, payload: { game: 0, attempt: 0, session: 1, lot: 0, commitment: 'c'.repeat(64) } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } alice`));
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } bob`);
            expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } carol`);
        });

        test('should report a discard revealed with cards of no deck', async () => {
            // Given
            await started({ bob: tampering(BPGameSessionType.DISCARD, (payload: object) => ({ ...payload, cards: ['a'] })) });
            await dealt();

            // When
            await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).discard([])));

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } bob`));
        });
    });

    describe('the timeouts', () => {
        test('should close the bidding once its time is over, the players late bidding nothing', async () => {
            // Given
            await started();
            await of('alice').bid(10);
            await settled((session: BidPokerSession) => session.game()?.committed().length === 1);

            // When
            claim('alice');

            // Then
            await settled((session: BidPokerSession) => session.game()?.lotIndex() === 1);
            expect(gameOf('eve').events()[0]).toMatchObject({ kind: BidEventKind.MISSED, reason: MissedReason.LATE, players: [1, 2, 3] });
            expect(gameOf('eve').events()[1]).toMatchObject({ kind: BidEventKind.SOLD, winner: 0, price: 10 });
            expect(of('eve').awaited()).toEqual(['alice']);
        });

        test('should void a claim coming before the time of the phase, its claimer waiting again', async () => {
            // Given
            hub.time = 1_000;
            await started();

            // When
            claim('bob', 1_000 + (LIGHT.catalogueTime + LIGHT.bidTime - 3) * 1000);
            await settled((session: BidPokerSession) => !session.sending());

            // Then
            expect([of('bob').voidedClaims(), of('alice').voidedClaims()]).toEqual([1, 0]);
            expect(gameOf('eve').events()).toEqual([]);

            // When
            claim('bob', 1_000 + (LIGHT.catalogueTime + LIGHT.bidTime - 2) * 1000);

            // Then
            await settled((session: BidPokerSession) => (session.game()?.events().length ?? 0) > 0);
        });

        test('should take a claim at once in a room without time', async () => {
            // Given
            await seated();
            rooms.forEach((room: Room<BidPokerPayloads>) => vi.spyOn(room, 'sequencedAt').mockReturnValue(undefined));
            hub.hold('dave');
            await of('alice').start();
            await settled((session: BidPokerSession) => session.awaited().length === 1);

            // When
            claim('alice', 0);

            // Then
            await settled((session: BidPokerSession) => !session.started());
        });

        test('should ignore a claim of a step past, of a spectator, of another game, or while nothing is awaited', async () => {
            // Given
            await started();
            const step: number = of('eve').step();
            await auction([1, 0, 0, 0]);

            // When
            hub.time = LATER;
            hub.send({ from: 'alice', type: BPGameSessionType.TIMEOUT, payload: { game: 0, attempt: 0, step } });
            hub.send({ from: 'eve', type: BPGameSessionType.TIMEOUT, payload: { game: 0, attempt: 0, step: of('eve').step() } });
            hub.send({ from: 'alice', type: BPGameSessionType.TIMEOUT, payload: { game: 1, attempt: 0, step: of('eve').step() } });
            await of('bob').bid(1);

            // Then
            await settled((session: BidPokerSession) => session.game()?.committed().length === 1);
            expect(gameOf('eve').events()).toHaveLength(1);
        });

        test('should start the game again once the draw times out, the seats of its late players freed', async () => {
            // Given
            hub.time = 0;
            await seated();
            hub.hold('dave');
            await of('alice').start();
            await settled((session: BidPokerSession) => session.awaited().length === 1);

            // When
            claim('alice', LIGHT.drawTime * 1000);

            // Then
            await settled((session: BidPokerSession) => !session.started());
            expect(of('eve').tableSeats.seats()).toEqual(['alice', 'bob', 'carol', null, null, null, null, null]);
            expect(of('eve').played().attempt).toEqual(1);

            // When the late part comes, then a player takes the seat and the game starts again
            hub.release();
            of('eve').takeSeat(3);
            await settled((session: BidPokerSession) => session.players().includes('eve'));
            await of('bob').start();

            // Then
            await settled((session: BidPokerSession) => session.game() !== null);
            expect(of('alice').players()).toEqual(['alice', 'bob', 'carol', 'eve']);
        });
    });

    test('should keep the bid sealed by a player who reloads the page, and reveal it', async () => {
        // Given
        await started();
        await of('bob').bid(42);
        await settled((session: BidPokerSession) => session.game()?.committed().length === 1);

        // When Bob reloads the page
        of('bob').destroy();
        hub.close(rooms.get('bob') as Room<BidPokerPayloads>);
        const reloaded: BidPokerSession = page('bob');
        const caughtUp = vi.fn();
        reloaded.caughtUp.subscribe(caughtUp);
        hub.replay(rooms.get('bob') as Room<BidPokerPayloads>);
        await eventually(() => expect(reloaded.myBid()).toEqual(42));

        // Then
        expect([reloaded.canBid(), reloaded.catalogues(), reloaded.liveEvents()]).toEqual([false, 0, 0]);

        // When
        await auction([0, undefined, 0, 0]);

        // Then
        expect(gameOf('eve').events()[0]).toMatchObject({ kind: BidEventKind.SOLD, winner: 1, price: 42 });
        expect(caughtUp).toHaveBeenCalledOnce();
    });

    test('should reveal the bid of the first commitment of the local player, a second one sealed meanwhile ignored', async () => {
        // Given
        await started();
        hub.hold('bob');
        await of('bob').bid(42);

        // When Bob reloads the page before his commitment is in the chain, and bids again
        of('bob').destroy();
        hub.close(rooms.get('bob') as Room<BidPokerPayloads>);
        const reloaded: BidPokerSession = page('bob');
        hub.replay(rooms.get('bob') as Room<BidPokerPayloads>);
        await eventually(() => expect(reloaded.canBid()).toBe(true));
        await reloaded.bid(7);
        hub.release();
        await auction([0, undefined, 0, 0]);

        // Then
        expect(gameOf('eve').events()[0]).toMatchObject({ kind: BidEventKind.SOLD, winner: 1, price: 42 });
        expect(hub.reports).toEqual([]);
    });

    test('should start a new game once the former one is over', async () => {
        // Given
        await started();
        await dealt();
        await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).discard([])));
        await settled((session: BidPokerSession) => session.over());

        // When
        of('eve').rematch();
        of('bob').rematch();
        of('carol').rematch();

        // Then
        await settled((session: BidPokerSession) => session.pastGames().length === 1);
        expect([of('eve').started(), of('eve').played().index, of('eve').pastGames()[0].result()?.pigs]).toEqual([false, 1, 1]);
        expect(of('alice').canStart()).toBe(true);
    });

    test('should free the seat of a player away, before the game starts', async () => {
        // Given
        await seated();
        hub.leave(rooms.get('dave') as Room<BidPokerPayloads>);
        of('dave').destroy();
        sessions.delete('dave');

        // When
        of('alice').unseat(3);

        // Then
        await settled((session: BidPokerSession) => session.players().length === 3);
        of('alice').leaveSeat();
        await eventually(() => expect(of('eve').players()).toEqual(['bob', 'carol']));
    });
});
