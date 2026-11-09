import { CryptoHelper } from '@app/helpers/crypto.helper';
import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { commitmentOf } from '@app/modules/commit-reveal/classes/commitment';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AppleOutcome } from '../rules/apple-count';
import { EdenEvent, EdenEventKind, EdenGameState, EdenPhase, MissedReason } from '../rules/eden-game-state';
import { Apple, EDEN_RULES, EdenRules, EdenSetup } from '../rules/eden-rules';
import { edenBlockChains, EdenPayloads, GEGameSessionType } from './eden-messages';
import { EdenSession } from './eden-session';

/** Two rounds: the specs play a game to its end quickly */
const LIGHT: EdenRules = { ...EDEN_RULES, rounds: 2 };
const PLAYERS: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
const SETUP: EdenSetup = { voteTime: 30, startMoney: 0 };
const RICH: EdenSetup = { voteTime: 60, startMoney: 1000 };
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const COMMITMENT: string = 'c'.repeat(64);
const { GOLD, SILVER, RED } = Apple;

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing the messages of a type */
function tampering(type: GEGameSessionType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });
const counted = (session: EdenSession): number =>
    session.game()?.events().filter((event: Readonly<EdenEvent>) => event.kind === EdenEventKind.COUNTED).length ?? 0;

describe('EdenSession', { timeout: 30_000 }, () => {
    let hub: RoomHub<EdenPayloads>;
    let rooms: Map<string, Room<EdenPayloads>>;
    let sessions: Map<string, EdenSession>;

    function page(name: string, tamper?: Tamper): EdenSession {
        const room: Room<EdenPayloads> = hub.room(name, tamper);
        const session = new EdenSession(room, { rules: LIGHT });
        rooms.set(name, room);
        sessions.set(name, session);
        return session;
    }

    const of = (name: string): EdenSession => sessions.get(name) as EdenSession;
    const gameOf = (name: string): EdenGameState => of(name).game() as EdenGameState;
    const lastCount = (): Readonly<EdenEvent> | undefined =>
        gameOf('eve').events().filter((event: Readonly<EdenEvent>) => event.kind === EdenEventKind.COUNTED).at(-1);

    /** Waits until every page passes the check */
    async function settled(check: (session: EdenSession) => boolean): Promise<void> {
        await eventually(() => sessions.forEach((session: EdenSession) => expect(check(session)).toBe(true)));
    }

    /** The players seated in that order, Eve watching */
    async function seated(players: ReadonlyArray<string> = PLAYERS, tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        players.forEach((name: string) => page(name, tampers[name]));
        page('eve');
        players.forEach((name: string, seat: number) => of(name).takeSeat(seat));
        await settled((session: EdenSession) => session.players().length === players.length);
    }

    /** The players seated, Alice starts the game: the vote of the first round opens on every page */
    async function started(setup: EdenSetup = SETUP, tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        await seated(PLAYERS, tampers);
        of('alice').start(setup);
        await settled((session: EdenSession) => session.game() !== null);
    }

    /** Each player votes, none for undefined, then every page counts the apples */
    async function voted(apples: ReadonlyArray<Apple | undefined>): Promise<void> {
        const before: number = counted(of('eve'));
        await Promise.all(apples.map((apple: Apple | undefined, player: number) => apple === undefined ? undefined : of(PLAYERS[player]).vote(apple)));
        await settled((session: EdenSession) => counted(session) > before);
    }

    function messagesOf(type: GEGameSessionType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    /** A claim of a timeout, at a time of the chain */
    function claim(name: string, at: number = LATER): void {
        hub.time = at;
        of(name).claimTimeout();
    }

    /** Dave leaves the room for good */
    function daveLeft(): void {
        hub.leave(rooms.get('dave') as Room<EdenPayloads>);
        of('dave').destroy();
        sessions.delete('dave');
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<EdenPayloads>();
        rooms = new Map();
        sessions = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: EdenSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should play the rules of the film by default', () => {
        expect(new EdenSession(hub.room('zoe')).rules).toBe(EDEN_RULES);
    });

    test('should route every message of the game to its chain', () => {
        expect(Object.keys(edenBlockChains)).toEqual(Object.values(GEGameSessionType));
        expect(new Set(Object.values(edenBlockChains))).toEqual(new Set([BlockChainName.EDEN]));
    });

    describe('the start', () => {
        test('should let a seated player start once 3 players are seated, with its setup, every page opening the first vote', async () => {
            // Given
            PLAYERS.slice(0, 3).forEach((name: string) => page(name));
            page('eve');
            of('alice').takeSeat(0);
            of('bob').takeSeat(4);
            await settled((session: EdenSession) => session.players().length === 2);

            // Then nobody starts nor votes
            expect([of('alice').canStart(), of('alice').myApple(), of('alice').canVote(), of('eve').setup()]).toEqual([false, null, false, null]);
            expect([of('alice').lostParadise(), of('eve').extendingAway()]).toEqual([false, []]);
            of('alice').start(RICH);
            await of('alice').vote(RED);
            expect(hub.delivered).toHaveLength(2);

            // When
            of('carol').takeSeat(7);
            await settled((session: EdenSession) => session.players().length === 3);
            of('alice').start(RICH);

            // Then the seats close, the players draw the seed, then vote
            await settled((session: EdenSession) => session.game() !== null);
            expect(messagesOf(GEGameSessionType.DRAW)).toHaveLength(7);
            const game: EdenGameState = gameOf('eve');
            expect([game.setup, game.players, game.balances()]).toEqual([RICH, 3, [1000, 1000, 1000]]);
            expect([of('eve').step(), of('eve').awaited(), of('eve').phaseTime()]).toEqual([2, ['alice', 'bob', 'carol'], RICH.voteTime]);
            expect([of('bob').inMatch(), of('eve').inMatch(), of('eve').setup()]).toEqual([true, false, RICH]);
            expect([of('alice').canVote(), of('eve').canVote(), of('eve').lostParadise()]).toEqual([true, false, false]);
            expect(hub.reports).toEqual([]);
        });

        test('should send no start with a setup the rules do not offer, and report one', async () => {
            // Given
            await seated();

            // When
            of('alice').start({ voteTime: 30, startMoney: 250 });
            hub.send({ from: 'bob', type: GEGameSessionType.DRAW, payload: { game: 0, attempt: 0, players: PLAYERS, voteTime: 30, startMoney: 250 } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } bob`));
            expect(messagesOf(GEGameSessionType.DRAW)).toHaveLength(1);
            expect(of('eve').started()).toBe(false);
        });
    });

    describe('a vote', () => {
        test('should seal the apples until every player committed, then reveal them by themselves and count them', async () => {
            // Given
            await started();

            // When
            await of('bob').vote(SILVER);

            // Then the apple of Bob stays sealed
            expect([of('bob').myApple(), of('bob').canVote(), of('alice').myApple(), of('eve').myApple()]).toEqual([SILVER, false, null, null]);
            await settled((session: EdenSession) => session.game()?.committed().length === 1);
            expect(messagesOf(GEGameSessionType.REVEAL)).toEqual([]);
            expect(of('eve').awaited()).toEqual(['alice', 'carol', 'dave']);

            // When
            await voted([RED, undefined, RED, RED]);

            // Then
            expect(lastCount()).toMatchObject({ outcome: AppleOutcome.LONE_APPLE, lone: 1,
                gains: [{ player: 0, gain: -100 }, { player: 1, gain: 200 }, { player: 2, gain: -100 }, { player: 3, gain: -100 }] });
            const types: string[] = hub.types();
            expect(types.indexOf(GEGameSessionType.REVEAL)).toBeGreaterThan(types.lastIndexOf(GEGameSessionType.COMMIT));
            expect(hub.reports).toEqual([]);
            expect(sessionStorage.getItem('synchronous-chess:sealed-apples:room:bob')).toEqual('{}');
            await settled((session: EdenSession) => session.game()?.round() === 1);
            expect([of('bob').myApple(), of('bob').canVote()]).toEqual([null, true]);
        });

        test('should report a malformed commitment, and ignore the commitments of another round or game, or of a spectator', async () => {
            // Given
            await started();
            const commit = { game: 0, attempt: 0, round: 0, commitment: COMMITMENT };

            // When
            hub.send({ from: 'alice', type: GEGameSessionType.COMMIT, payload: { ...commit, commitment: 'malformed' } });
            [{ round: 1 }, { game: 1 }, { attempt: 1 }].forEach((change: object) =>
                hub.send({ from: 'alice', type: GEGameSessionType.COMMIT, payload: { ...commit, ...change } }));
            hub.send({ from: 'eve', type: GEGameSessionType.COMMIT, payload: commit });
            hub.send({ from: 'eve', type: GEGameSessionType.REVEAL, payload: { ...commit, apple: RED, salt: 's' } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } alice`));
            expect(gameOf('eve').committed()).toEqual([]);
        });

        test.each([
            { name: 'otherwise than committed', change: (payload: { apple: Apple }) => ({ ...payload, apple: payload.apple === RED ? GOLD : RED }) },
            { name: 'without its salt', change: (payload: object) => ({ ...payload, salt: undefined }) },
            { name: 'with an apple of no text', change: (payload: object) => ({ ...payload, apple: 1 }) },
        ])('should report an apple revealed $name, its player losing 1,000 million', async ({ change }) => {
            // Given
            await started(SETUP, { carol: tampering(GEGameSessionType.REVEAL, change) });

            // When
            await voted([RED, RED, RED, RED]);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } carol`);
            expect(gameOf('eve').events()).toContainEqual({
                kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.REVEALING, reason: MissedReason.INVALID, players: [2], amount: 1000,
            });
            expect(sessionStorage.getItem('synchronous-chess:sealed-apples:room:carol')).toEqual('{}');
            expect(gameOf('eve').balances()).toEqual([100, 100, -1000, 100]);
        });

        test('should report a reveal of no apple, matching its commitment', async () => {
            // Given
            await started();
            const commitment: string = await commitmentOf([of('eve').played().id(), 'apple', 3, 0, 'green', 'salt'], ':');

            // When
            hub.send({ from: 'dave', type: GEGameSessionType.COMMIT, payload: { game: 0, attempt: 0, round: 0, commitment } });
            await Promise.all([RED, RED, RED].map((apple: Apple, player: number) => of(PLAYERS[player]).vote(apple)));
            await settled((session: EdenSession) => session.game()?.phase() === EdenPhase.REVEALING);
            hub.send({ from: 'dave', type: GEGameSessionType.REVEAL, payload: { game: 0, attempt: 0, round: 0, apple: 'green' as Apple, salt: 'salt' } });

            // Then
            await settled((session: EdenSession) => counted(session) === 1);
            expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } dave`);
            expect(lastCount()).toMatchObject({ outcome: AppleOutcome.ALL_RED, gains: [{ player: 0, gain: 100 }, { player: 1, gain: 100 },
                { player: 2, gain: 100 }, { player: 3, gain: -1000 }] });
        });

        test('should ignore a reveal out of the reveal phase, of another round, or of a player not awaited', async () => {
            // Given
            await started();
            const reveal = { game: 0, attempt: 0, round: 0, apple: RED, salt: 's' };

            // When
            hub.send({ from: 'alice', type: GEGameSessionType.REVEAL, payload: reveal });
            await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).vote(RED)));
            hub.hold('dave');
            await of('dave').vote(GOLD);
            hub.send({ from: 'alice', type: GEGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: 'alice', type: GEGameSessionType.REVEAL, payload: { ...reveal, round: 1 } });
            hub.send({ from: 'zoe', type: GEGameSessionType.REVEAL, payload: reveal });

            // Then
            expect(hub.reports).toEqual([]);
            hub.release();
            await settled((session: EdenSession) => counted(session) === 1);
            expect(lastCount()).toMatchObject({ outcome: AppleOutcome.LONE_APPLE, lone: 3 });
        });
    });

    describe('the loss of paradise', () => {
        test('should make a player out a spectator, its apple refused, its claims still counting', async () => {
            // Given
            await started();

            // When
            await voted([RED, GOLD, SILVER, GOLD]);

            // Then
            expect(gameOf('eve').events().at(-1)).toEqual({ kind: EdenEventKind.OUT, round: 0, players: [0] });
            await settled((session: EdenSession) => session.game()?.round() === 1);
            expect([of('alice').lostParadise(), of('alice').inMatch(), of('alice').canVote()]).toEqual([true, false, false]);
            expect([of('bob').lostParadise(), of('bob').inMatch(), of('bob').canVote()]).toEqual([false, true, true]);
            expect(of('eve').awaited()).toEqual(['bob', 'carol', 'dave']);

            // When
            hub.send({ from: 'alice', type: GEGameSessionType.COMMIT, payload: { game: 0, attempt: 0, round: 1, commitment: COMMITMENT } });
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } alice`));
            await Promise.all(['bob', 'carol'].map((name: string) => of(name).vote(RED)));
            await settled((session: EdenSession) => session.game()?.committed().length === 2);
            claim('alice');

            // Then Dave missed the last vote: the game is over
            await settled((session: EdenSession) => session.over());
            expect(gameOf('eve').balances()).toEqual([-1000, 200, 200, 0]);
            expect(of('eve').played().result()?.winners).toEqual([1, 2]);
        });
    });

    describe('the timeouts', () => {
        test('should take 100 million from a player away not voting in time, the next votes giving it no more time', async () => {
            // Given Dave away during the first vote
            await started();
            await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).vote(RED)));
            daveLeft();
            await settled((session: EdenSession) => session.awaitedAway().join() === 'dave');

            // Then
            expect(of('eve').extendingAway()).toEqual(['dave']);

            // When
            claim('alice');

            // Then
            await settled((session: EdenSession) => session.game()?.round() === 1);
            expect(gameOf('eve').events()).toContainEqual({
                kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.VOTING, reason: MissedReason.LATE, players: [3], amount: 100,
            });
            expect(gameOf('eve').balances()).toEqual([100, 100, 100, -100]);
            expect([of('eve').awaitedAway(), of('eve').extendingAway(), gameOf('eve').absent()]).toEqual([['dave'], [], [3]]);
        });

        test('should commit to the round voted, a timeout applied while the apple is sealed moving to the next one', async () => {
            // Given
            await started();
            await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).vote(RED)));
            await settled((session: EdenSession) => session.game()?.committed().length === 3);

            // When Dave votes as the time runs out: the vote is over while his page hashes his apple
            const sha256 = CryptoHelper.sha256.bind(CryptoHelper);
            let hashed: () => void = () => undefined;
            const hashing = new Promise<void>((resolve) => hashed = resolve);
            vi.spyOn(CryptoHelper, 'sha256').mockImplementationOnce(async (text: string) => {
                await hashing;
                return sha256(text);
            });
            const voting: Promise<void> = of('dave').vote(GOLD);
            claim('alice');
            await settled((session: EdenSession) => session.game()?.round() === 1);
            hashed();
            await voting;

            // Then his commitment names the round he voted on: the next round ignores it, his page its seal
            expect(messagesOf(GEGameSessionType.COMMIT, 'dave').map((message: AppMessage) => message.payload)).toMatchObject([{ round: 0 }]);
            expect(gameOf('eve').committed()).toEqual([]);
            await eventually(() => expect(sessionStorage.getItem('synchronous-chess:sealed-apples:room:dave')).toEqual('{}'));
        });

        test('should void a claim coming before the time of the vote picked, then count no apple', async () => {
            // Given
            hub.time = 1_000;
            await started();

            // When
            claim('bob', 1_000 + (SETUP.voteTime - 3) * 1000);
            await settled((session: EdenSession) => !session.sending());

            // Then
            expect([of('bob').voidedClaims(), gameOf('eve').phase()]).toEqual([1, EdenPhase.VOTING]);

            // When
            claim('bob', 1_000 + (SETUP.voteTime - 2) * 1000);

            // Then every player missed the vote
            await settled((session: EdenSession) => counted(session) === 1);
            expect(lastCount()).toMatchObject({ outcome: AppleOutcome.NO_VOTE });
            expect(gameOf('eve').balances()).toEqual([-100, -100, -100, -100]);
        });

        test('should close the reveals once their time is over, the apple withheld costing 1,000 million', async () => {
            // Given
            await started(SETUP, { dave: tampering(GEGameSessionType.REVEAL, (payload: object) => ({ ...payload, game: 9 })) });

            // When the reveal of Dave never counts, then the time is over
            await Promise.all([RED, RED, RED, GOLD].map((apple: Apple, player: number) => of(PLAYERS[player]).vote(apple)));
            await eventually(() => expect(messagesOf(GEGameSessionType.REVEAL)).toHaveLength(4));
            expect([of('dave').myApple(), of('eve').myApple()]).toEqual([GOLD, null]);
            claim('alice');

            // Then
            await settled((session: EdenSession) => counted(session) === 1);
            expect(gameOf('eve').events()).toContainEqual({
                kind: EdenEventKind.MISSED, round: 0, phase: EdenPhase.REVEALING, reason: MissedReason.LATE, players: [3], amount: 1000,
            });
            expect(gameOf('eve').balances()).toEqual([100, 100, 100, -1000]);
            expect(sessionStorage.getItem('synchronous-chess:sealed-apples:room:dave')).toEqual('{}');
        });
    });

    test('should keep the apple sealed by a player who reloads the page, and reveal it', async () => {
        // Given
        await started();
        await of('bob').vote(SILVER);
        await settled((session: EdenSession) => session.game()?.committed().length === 1);

        // When Bob reloads the page
        of('bob').destroy();
        hub.close(rooms.get('bob') as Room<EdenPayloads>);
        const reloaded: EdenSession = page('bob');
        hub.replay(rooms.get('bob') as Room<EdenPayloads>);
        await eventually(() => expect(reloaded.myApple()).toEqual(SILVER));

        // Then
        expect([reloaded.canVote(), reloaded.inMatch()]).toEqual([false, true]);

        // When
        await voted([RED, undefined, RED, RED]);

        // Then
        expect(lastCount()).toMatchObject({ outcome: AppleOutcome.LONE_APPLE, lone: 1 });
    });

    test('should free the seat of a player away, before the game starts', async () => {
        // Given
        await seated();
        daveLeft();

        // When
        of('alice').unseat(3);

        // Then
        await settled((session: EdenSession) => session.players().length === 3);
    });

    test('should play a new game once the former one is over, with its own setup', async () => {
        // Given
        await started();
        await voted([RED, RED, RED, RED]);
        await voted([GOLD, GOLD, SILVER, RED]);
        await settled((session: EdenSession) => session.over());
        expect(of('eve').played().result()?.winners).toEqual([0, 1, 2]);

        // When
        ['eve', 'bob', 'carol'].forEach((name: string) => of(name).rematch());
        await settled((session: EdenSession) => session.pastGames().length === 1);
        expect([of('alice').canStart(), of('eve').setup()]).toEqual([true, null]);
        of('dave').start(RICH);
        await settled((session: EdenSession) => session.game() !== null);

        // Then
        expect([gameOf('eve').setup, gameOf('eve').balances()]).toEqual([RICH, [1000, 1000, 1000, 1000]]);
        expect(hub.reports).toEqual([]);
    });
});
