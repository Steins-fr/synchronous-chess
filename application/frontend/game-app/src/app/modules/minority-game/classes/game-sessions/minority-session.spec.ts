import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { commitmentOf } from '@app/modules/commit-reveal/classes/commitment';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { drawAsker } from '../rules/asker';
import { MinorityEvent, MinorityEventKind, MinorityGameState, MinorityPhase, MissedReason, VoteOutcome } from '../rules/minority-game-state';
import { MINORITY_RULES, MinorityRules, MinoritySetup, MinorityVariant, Vote } from '../rules/minority-rules';
import { MGGameSessionType, minorityBlockChains, MinorityPayloads } from './minority-messages';
import { MinoritySession } from './minority-session';

/** Two rounds in the score variant: the specs play a game to its end quickly */
const LIGHT: MinorityRules = { ...MINORITY_RULES, rounds: 2 };
const PLAYERS: ReadonlyArray<string> = ['alice', 'bob', 'carol', 'dave'];
const ELIMINATION: MinoritySetup = { variant: MinorityVariant.ELIMINATION, voteTime: 30 };
const SCORE: MinoritySetup = { variant: MinorityVariant.SCORE, voteTime: 60 };
const QUESTION = 'Will you vote yes?';
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const COMMITMENT: string = 'c'.repeat(64);
const { YES, NO } = Vote;

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing the messages of a type */
function tampering(type: MGGameSessionType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });
const counted = (session: MinoritySession): number =>
    session.game()?.events().filter((event: Readonly<MinorityEvent>) => event.kind === MinorityEventKind.COUNTED).length ?? 0;

describe('MinoritySession', { timeout: 30_000 }, () => {
    let hub: RoomHub<MinorityPayloads>;
    let rooms: Map<string, Room<MinorityPayloads>>;
    let sessions: Map<string, MinoritySession>;

    function page(name: string, tamper?: Tamper): MinoritySession {
        const room: Room<MinorityPayloads> = hub.room(name, tamper);
        const session = new MinoritySession(room, { rules: LIGHT });
        rooms.set(name, room);
        sessions.set(name, session);
        return session;
    }

    const of = (name: string): MinoritySession => sessions.get(name) as MinoritySession;
    const gameOf = (name: string): MinorityGameState => of(name).game() as MinorityGameState;
    const lastEvent = (): Readonly<MinorityEvent> | undefined => gameOf('eve').events().at(-1);

    /** Waits until every page passes the check */
    async function settled(check: (session: MinoritySession) => boolean): Promise<void> {
        await eventually(() => sessions.forEach((session: MinoritySession) => expect(check(session)).toBe(true)));
    }

    /** The players seated in that order, Eve watching */
    async function seated(players: ReadonlyArray<string> = PLAYERS, tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        players.forEach((name: string) => page(name, tampers[name]));
        page('eve');
        players.forEach((name: string, seat: number) => of(name).takeSeat(seat));
        await settled((session: MinoritySession) => session.players().length === players.length);
    }

    /** The players seated, Alice starts the game: every page draws the same asker */
    async function started(
        setup: MinoritySetup = ELIMINATION, players: ReadonlyArray<string> = PLAYERS, tampers: Readonly<Record<string, Tamper>> = {},
    ): Promise<void> {
        await seated(players, tampers);
        of('alice').start(setup);
        await settled((session: MinoritySession) => session.asker() !== null);
    }

    /** The asker drawn asks the question: the vote opens on every page */
    async function asked(): Promise<string> {
        await settled((session: MinoritySession) => session.asker() !== null);
        const asker: string = of('eve').asker() as string;
        of(asker).ask(QUESTION);
        await settled((session: MinoritySession) => session.game()?.phase() === MinorityPhase.VOTING);
        return asker;
    }

    /** Each player votes, none for undefined, then every page counts the votes */
    async function voted(votes: ReadonlyArray<Vote | undefined>): Promise<void> {
        const before: number = counted(of('eve'));
        await Promise.all(votes.map((vote: Vote | undefined, player: number) => vote === undefined ? undefined : of(PLAYERS[player]).vote(vote)));
        await settled((session: MinoritySession) => counted(session) > before);
    }

    function messagesOf(type: MGGameSessionType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    /** A claim of a timeout, at a time of the chain */
    function claim(name: string, at: number = LATER): void {
        hub.time = at;
        of(name).claimTimeout();
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<MinorityPayloads>();
        rooms = new Map();
        sessions = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: MinoritySession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should play the rules of the manga by default', () => {
        expect(new MinoritySession(hub.room('zoe')).rules).toBe(MINORITY_RULES);
    });

    test('should route every message of the game to its chain', () => {
        expect(Object.keys(minorityBlockChains)).toEqual(Object.values(MGGameSessionType));
        expect(new Set(Object.values(minorityBlockChains))).toEqual(new Set([BlockChainName.MINORITY]));
    });

    describe('the start', () => {
        test('should let a seated player start once 3 players are seated, with its setup, every page drawing the same asker', async () => {
            // Given
            PLAYERS.slice(0, 3).forEach((name: string) => page(name));
            page('eve');
            of('alice').takeSeat(0);
            of('bob').takeSeat(4);
            await settled((session: MinoritySession) => session.players().length === 2);

            // Then nobody starts, asks nor votes
            expect([of('alice').canStart(), of('alice').myVote(), of('alice').asker(), of('eve').awaited(), of('eve').setup()]).toEqual([false, null, null, [], null]);
            of('alice').start(SCORE);
            of('alice').ask(QUESTION);
            await of('alice').vote(YES);
            expect(hub.delivered).toHaveLength(2);

            // When
            of('carol').takeSeat(7);
            await settled((session: MinoritySession) => session.players().length === 3);

            // Then
            expect([of('alice').canStart(), of('eve').canStart()]).toEqual([true, false]);
            expect([of('alice').started(), of('alice').seatsOpen(), of('alice').inMatch()]).toEqual([false, true, false]);

            // When
            of('alice').start(SCORE);

            // Then the seats close at once, the players draw the seed
            await settled((session: MinoritySession) => session.started());
            expect([of('bob').seatsOpen(), of('bob').inMatch(), of('eve').inMatch(), of('eve').setup()]).toEqual([false, true, false, SCORE]);
            await settled((session: MinoritySession) => session.asker() !== null);
            // The start, then the commitment and the part of each player
            expect(messagesOf(MGGameSessionType.DRAW)).toHaveLength(7);
            const game: MinorityGameState = gameOf('eve');
            const asker: number = await drawAsker(game.seed, { round: 0, ask: 0, candidates: [0, 1, 2] });
            sessions.forEach((session: MinoritySession) => expect(session.asker()).toEqual(PLAYERS[asker]));
            expect([game.variant, game.setup.voteTime, game.players]).toEqual([MinorityVariant.SCORE, 60, 3]);
            expect([of('eve').step(), of('eve').awaited(), of('eve').phaseTime()]).toEqual([2, [PLAYERS[asker]], LIGHT.questionTime]);
            expect([of(PLAYERS[asker]).canAsk(), of(PLAYERS[(asker + 1) % 3]).canAsk(), of('eve').canAsk()]).toEqual([true, false, false]);
            expect([of('alice').myVote(), of('eve').myVote()]).toEqual([null, null]);
            expect(hub.reports).toEqual([]);
            // Their parts in the chain, the pages keep them no more
            expect(sessionStorage.getItem('synchronous-chess:sealed-draws:room:alice')).toEqual('{}');
        });

        test('should send no start with a setup the rules do not offer, and report one', async () => {
            // Given
            await seated();

            // When
            of('alice').start({ variant: MinorityVariant.SCORE, voteTime: 45 });
            hub.send({ from: 'bob', type: MGGameSessionType.DRAW, payload: { game: 0, attempt: 0, players: PLAYERS, variant: 'knockout' as MinorityVariant, voteTime: 30 } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } bob`));
            expect(messagesOf(MGGameSessionType.DRAW)).toHaveLength(1);
            expect(of('eve').started()).toBe(false);
        });

        test('should ignore a start naming other players than the seated ones, of a spectator, of another game, or once started', async () => {
            // Given
            await seated();
            const start = { attempt: 0, variant: MinorityVariant.ELIMINATION, voteTime: 30 };

            // When
            hub.send({ from: 'alice', type: MGGameSessionType.DRAW, payload: { ...start, game: 0, players: ['alice', 'bob', 'carol'] } });
            hub.send({ from: 'alice', type: MGGameSessionType.DRAW, payload: { ...start, game: 0, commitment: COMMITMENT } });
            hub.send({ from: 'eve', type: MGGameSessionType.DRAW, payload: { ...start, game: 0, players: PLAYERS } });
            hub.send({ from: 'alice', type: MGGameSessionType.DRAW, payload: { ...start, game: 1, players: PLAYERS } });
            of('alice').start(ELIMINATION);
            hub.send({ from: 'bob', type: MGGameSessionType.DRAW, payload: { ...start, game: 0, players: PLAYERS, voteTime: 300 } });
            await settled((session: MinoritySession) => session.asker() !== null);

            // Then
            expect(of('eve').players()).toEqual(PLAYERS);
            expect(of('eve').setup()).toEqual(ELIMINATION);
            expect(hub.reports).toEqual([]);
        });

        test('should wait for the random parts of the players while drawing the seed', async () => {
            // Given
            await seated();
            hub.hold('dave');

            // When
            of('alice').start(ELIMINATION);
            await settled((session: MinoritySession) => session.awaited().length === 1);

            // Then
            expect([of('eve').awaited(), of('eve').step(), of('eve').phaseTime(), of('eve').asker()]).toEqual([['dave'], 0, LIGHT.drawTime, null]);

            // When
            hub.release();

            // Then
            await settled((session: MinoritySession) => session.asker() !== null);
        });

        test('should wait for a random part its page lost, its storage blocked', async () => {
            // Given
            await seated();
            hub.hold('dave');
            of('alice').start(ELIMINATION);
            await settled((session: MinoritySession) => session.awaited().length === 1);
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
            await eventually(() => expect(messagesOf(MGGameSessionType.DRAW, 'dave')).toHaveLength(1));
            await settled((session: MinoritySession) => session.awaited().join() === 'dave');
            expect(of('eve').game()).toBeNull();
        });

        test('should report a malformed commitment of the draw, and a random part not matching its commitment', async () => {
            // Given
            await seated(PLAYERS, {
                bob: tampering(MGGameSessionType.DRAW, (payload: { part?: string }) => payload.part === undefined ? payload : { ...payload, part: 'not mine' }),
            });

            // When
            of('alice').start(ELIMINATION);
            hub.send({ from: 'carol', type: MGGameSessionType.DRAW, payload: { game: 0, attempt: 0, commitment: 'malformed' } });
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } bob`));

            // Then the draw waits for the part of Bob
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } carol`);
            expect(of('eve').awaited()).toEqual(['bob']);
            expect(of('eve').game()).toBeNull();
        });
    });

    describe('a question', () => {
        test('should let the asker alone ask, trimmed, every page showing the question, then open the vote', async () => {
            // Given
            await started();
            const asker: string = of('eve').asker() as string;
            const other: string = PLAYERS.find((name: string) => name !== asker) as string;

            // When
            of(other).ask(QUESTION);
            of(asker).ask(`  ${ QUESTION }  `);

            // Then
            await settled((session: MinoritySession) => session.game()?.question() === QUESTION);
            expect(messagesOf(MGGameSessionType.QUESTION)).toHaveLength(1);
            expect([of('eve').awaited(), of('eve').phaseTime(), of('eve').step()]).toEqual([PLAYERS, ELIMINATION.voteTime, 3]);
            expect([of(asker).canVote(), of(other).canVote(), of('eve').canVote(), of(asker).canAsk()]).toEqual([true, true, false, false]);
        });

        test.each([
            { name: 'blank', text: '   ' },
            { name: 'too long', text: 'a'.repeat(121) },
            { name: 'holding a link', text: 'Is www.example.org yours?' },
        ])('should send no question $name', async ({ text }) => {
            // Given
            await started();

            // When
            of(of('eve').asker() as string).ask(text);

            // Then
            expect(messagesOf(MGGameSessionType.QUESTION)).toEqual([]);
        });

        test('should report a question of another player than the asker, and one the application would not send', async () => {
            // Given
            await started();
            const asker: string = of('eve').asker() as string;
            const other: string = PLAYERS.find((name: string) => name !== asker) as string;
            const question = { game: 0, attempt: 0, round: 0, ask: 0, text: QUESTION };

            // When
            hub.send({ from: other, type: MGGameSessionType.QUESTION, payload: question });
            hub.send({ from: asker, type: MGGameSessionType.QUESTION, payload: { ...question, text: 'Is bob@example.org yours?' } });
            [{ round: 1 }, { ask: 1 }, { game: 1 }].forEach((change: object) =>
                hub.send({ from: asker, type: MGGameSessionType.QUESTION, payload: { ...question, ...change } }));
            hub.send({ from: 'eve', type: MGGameSessionType.QUESTION, payload: question });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } ${ asker }`));
            expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } ${ other }`);
            expect(gameOf('eve').phase()).toEqual(MinorityPhase.ASKING);
            expect(of('eve').awaited()).toEqual([asker]);
        });
    });

    describe('a vote', () => {
        test('should seal the votes until every player still in committed, then reveal them by themselves', async () => {
            // Given
            await started();
            await asked();

            // When
            await of('bob').vote(YES);

            // Then the vote of Bob stays sealed
            expect([of('bob').myVote(), of('bob').canVote(), of('alice').myVote(), of('eve').myVote()]).toEqual([YES, false, null, null]);
            await settled((session: MinoritySession) => session.game()?.committed().length === 1);
            expect(messagesOf(MGGameSessionType.REVEAL)).toEqual([]);
            expect(of('eve').awaited()).toEqual(['alice', 'carol', 'dave']);

            // When
            await voted([YES, undefined, YES, NO]);

            // Then
            expect(gameOf('eve').events().at(-1)).toMatchObject({ kind: MinorityEventKind.COUNTED, outcome: VoteOutcome.MINORITY, eliminated: [0, 1, 2] });
            const types: string[] = hub.types();
            expect(types.indexOf(MGGameSessionType.REVEAL)).toBeGreaterThan(types.lastIndexOf(MGGameSessionType.COMMIT));
            expect(hub.reports).toEqual([]);
            expect(sessionStorage.getItem('synchronous-chess:sealed-votes:room:bob')).toEqual('{}');
            // The game over, Dave won
            await settled((session: MinoritySession) => session.over());
            expect([of('dave').inMatch(), of('dave').seatsOpen(), of('eve').played().result()?.winners]).toEqual([false, true, [3]]);
        });

        test('should report a malformed commitment, and ignore the commitments of another question or game, or of a spectator', async () => {
            // Given
            await started();
            await asked();
            const commit = { game: 0, attempt: 0, round: 0, ask: 0, commitment: COMMITMENT };

            // When
            hub.send({ from: 'alice', type: MGGameSessionType.COMMIT, payload: { ...commit, commitment: 'malformed' } });
            [{ round: 1 }, { ask: 1 }, { game: 1 }, { attempt: 1 }].forEach((change: object) =>
                hub.send({ from: 'alice', type: MGGameSessionType.COMMIT, payload: { ...commit, ...change } }));
            hub.send({ from: 'eve', type: MGGameSessionType.COMMIT, payload: commit });
            hub.send({ from: 'eve', type: MGGameSessionType.REVEAL, payload: { ...commit, vote: YES, salt: 's' } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } alice`));
            expect(gameOf('eve').committed()).toEqual([]);
        });

        test.each([
            { name: 'otherwise than committed', change: (payload: { vote: Vote }) => ({ ...payload, vote: payload.vote === YES ? NO : YES }) },
            { name: 'without its salt', change: (payload: object) => ({ ...payload, salt: undefined }) },
            { name: 'with a vote of no text', change: (payload: object) => ({ ...payload, vote: 1 }) },
        ])('should report a vote revealed $name, its player eliminated', async ({ change }) => {
            // Given
            await started(ELIMINATION, PLAYERS, { carol: tampering(MGGameSessionType.REVEAL, change) });
            await asked();

            // When
            await voted([YES, YES, NO, NO]);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } carol`);
            expect(gameOf('eve').events()).toContainEqual({
                kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.INVALID, players: [2],
            });
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 1, 2] });
        });

        test('should report a vote neither yes nor no, matching its commitment', async () => {
            // Given
            await started();
            await asked();
            const id: string = of('eve').played().id();
            const commitment: string = await commitmentOf([id, 'vote', 3, '0:0', 'maybe', 'salt'], ':');

            // When
            hub.send({ from: 'dave', type: MGGameSessionType.COMMIT, payload: { game: 0, attempt: 0, round: 0, ask: 0, commitment } });
            await Promise.all([YES, YES, NO].map((vote: Vote, player: number) => of(PLAYERS[player]).vote(vote)));
            await settled((session: MinoritySession) => session.game()?.phase() === MinorityPhase.REVEALING);
            hub.send({ from: 'dave', type: MGGameSessionType.REVEAL, payload: { game: 0, attempt: 0, round: 0, ask: 0, vote: 'maybe' as Vote, salt: 'salt' } });

            // Then
            await settled((session: MinoritySession) => counted(session) === 1);
            expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } dave`);
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 1, 3] });
        });

        test('should ignore a reveal out of the reveal phase, of another question, or of a player not awaited', async () => {
            // Given
            await started();
            await asked();
            const reveal = { game: 0, attempt: 0, round: 0, ask: 0, vote: YES, salt: 's' };

            // When
            hub.send({ from: 'alice', type: MGGameSessionType.REVEAL, payload: reveal });
            await of('alice').vote(YES);
            await of('bob').vote(NO);
            await of('carol').vote(NO);
            hub.hold('dave');
            await of('dave').vote(NO);
            hub.send({ from: 'alice', type: MGGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: 'alice', type: MGGameSessionType.REVEAL, payload: { ...reveal, ask: 1 } });

            // Then
            expect(hub.reports).toEqual([]);
            hub.release();
            await settled((session: MinoritySession) => counted(session) === 1);
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [1, 2, 3] });
        });
    });

    describe('the elimination variant', () => {
        test('should eliminate a player not voting in time, a spectator then, its claims still counting', async () => {
            // Given
            await started();
            await asked();
            await Promise.all(['alice', 'bob', 'carol'].map((name: string) => of(name).vote(YES)));
            await settled((session: MinoritySession) => session.game()?.committed().length === 3);

            // When
            claim('bob');

            // Then
            await settled((session: MinoritySession) => counted(session) === 1);
            expect(gameOf('eve').events()).toContainEqual({
                kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.VOTING, reason: MissedReason.LATE, players: [3],
            });
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.UNANIMOUS, eliminated: [3] });
            expect([of('dave').eliminated(), of('dave').inMatch(), of('alice').eliminated(), of('alice').inMatch()]).toEqual([true, false, false, true]);
            await settled((session: MinoritySession) => session.asker() !== null);
            expect(of('eve').asker()).not.toEqual('dave');

            // When Dave claims the time of the asker
            claim('dave', 2 * LATER);

            // Then
            await settled((session: MinoritySession) => session.game()?.ask() === 1);
            expect(lastEvent()).toMatchObject({ kind: MinorityEventKind.ASKER_LATE, round: 1 });

            // When
            await asked();
            hub.send({ from: 'dave', type: MGGameSessionType.COMMIT, payload: { game: 0, attempt: 0, round: 1, ask: 1, commitment: COMMITMENT } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.ILLEGAL_MOVE } dave`));
            expect(of('dave').canVote()).toBe(false);
        });

        test('should ask a new question of another asker on a tie, every page drawing it, a page joining late too', async () => {
            // Given
            await started();
            const first: string = await asked();

            // When
            await voted([YES, NO, NO, YES]);

            // Then
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.TIE, eliminated: [] });
            await settled((session: MinoritySession) => session.asker() !== null);
            expect([gameOf('eve').round(), gameOf('eve').ask()]).toEqual([1, 0]);
            expect(of('eve').asker()).not.toEqual(first);

            // When Zoe joins the room
            const late: MinoritySession = page('zoe');
            hub.replay(rooms.get('zoe') as Room<MinorityPayloads>);

            // Then
            await eventually(() => expect(late.asker()).toEqual(of('eve').asker()));
            expect(late.game()?.events()).toEqual(gameOf('eve').events());
        });
    });

    describe('the score variant', () => {
        test('should score the minority over the rounds, then end, nobody eliminated', async () => {
            // Given
            await started(SCORE);

            // When
            await asked();
            await voted([YES, YES, NO, NO]);
            await asked();
            await voted([YES, YES, YES, NO]);

            // Then
            await settled((session: MinoritySession) => session.over());
            expect(gameOf('eve').scores()).toEqual([0, 0, 0, 3]);
            expect(of('eve').played().result()).toMatchObject({ variant: MinorityVariant.SCORE, winners: [3] });
            expect([of('alice').eliminated(), of('alice').inMatch()]).toEqual([false, false]);
        });
    });

    describe('the timeouts', () => {
        test('should draw another asker once the asker does not ask in time', async () => {
            // Given
            await started();
            const asker: string = of('eve').asker() as string;

            // When
            claim('eve');
            claim(asker);

            // Then
            await settled((session: MinoritySession) => session.game()?.ask() === 1 && session.asker() !== null);
            expect(of('eve').asker()).not.toEqual(asker);
            expect(gameOf('eve').absent()).toEqual([PLAYERS.indexOf(asker)]);
        });

        test('should void a claim coming before the time of the vote picked, its claimer waiting again', async () => {
            // Given
            hub.time = 1_000;
            await started();
            await asked();

            // When
            claim('bob', 1_000 + (ELIMINATION.voteTime - 3) * 1000);
            await settled((session: MinoritySession) => !session.sending());

            // Then
            expect([of('bob').voidedClaims(), of('alice').voidedClaims()]).toEqual([1, 0]);
            expect(gameOf('eve').phase()).toEqual(MinorityPhase.VOTING);

            // When
            claim('bob', 1_000 + (ELIMINATION.voteTime - 2) * 1000);

            // Then every player missed the vote: none is left
            await settled((session: MinoritySession) => session.over());
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.NO_VOTE, eliminated: [0, 1, 2, 3] });
            expect(of('eve').played().result()?.winners).toEqual([]);
        });

        test('should close the reveals once their time is over, the vote withheld eliminating its player', async () => {
            // Given
            await started(ELIMINATION, PLAYERS, { dave: tampering(MGGameSessionType.REVEAL, (payload: object) => ({ ...payload, game: 9 })) });
            await asked();

            // When the reveal of Dave never counts, then the time is over
            await Promise.all([YES, YES, NO, NO].map((vote: Vote, player: number) => of(PLAYERS[player]).vote(vote)));
            await eventually(() => expect(messagesOf(MGGameSessionType.REVEAL)).toHaveLength(4));
            expect([of('dave').myVote(), of('eve').myVote()]).toEqual([NO, null]);
            claim('alice');

            // Then
            await settled((session: MinoritySession) => counted(session) === 1);
            expect(gameOf('eve').events()).toContainEqual({
                kind: MinorityEventKind.MISSED, round: 0, phase: MinorityPhase.REVEALING, reason: MissedReason.LATE, players: [3],
            });
            expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 1, 3] });
        });

        test('should take a claim at once in a room without time', async () => {
            // Given
            await seated();
            rooms.forEach((room: Room<MinorityPayloads>) => vi.spyOn(room, 'sequencedAt').mockReturnValue(undefined));
            hub.hold('dave');
            of('alice').start(ELIMINATION);
            await settled((session: MinoritySession) => session.awaited().length === 1);

            // When
            claim('alice', 0);

            // Then
            await settled((session: MinoritySession) => !session.started());
        });

        test('should ignore a claim of a step past, of a spectator, of another game, or while nothing is awaited', async () => {
            // Given
            await seated();
            claim('alice');
            await started();
            const step: number = of('eve').step();
            await asked();

            // When
            hub.time = LATER;
            hub.send({ from: 'alice', type: MGGameSessionType.TIMEOUT, payload: { game: 0, attempt: 0, step } });
            hub.send({ from: 'eve', type: MGGameSessionType.TIMEOUT, payload: { game: 0, attempt: 0, step: of('eve').step() } });
            hub.send({ from: 'alice', type: MGGameSessionType.TIMEOUT, payload: { game: 1, attempt: 0, step: of('eve').step() } });
            await of('bob').vote(YES);

            // Then
            await settled((session: MinoritySession) => session.game()?.committed().length === 1);
            expect(gameOf('eve').events()).toHaveLength(1);
        });

        test('should ignore a claim once the game is over', async () => {
            // Given
            await started();
            await asked();
            await voted([YES, YES, YES, NO]);
            await settled((session: MinoritySession) => session.over());

            // When
            claim('dave');

            // Then
            await settled((session: MinoritySession) => !session.sending());
            expect(gameOf('eve').events()).toHaveLength(2);
        });

        test('should start the game again once the draw times out, the seats of its late players freed', async () => {
            // Given
            hub.time = 0;
            await seated();
            hub.hold('dave');
            of('alice').start(ELIMINATION);
            await settled((session: MinoritySession) => session.awaited().length === 1);

            // When
            claim('alice', LIGHT.drawTime * 1000);

            // Then
            await settled((session: MinoritySession) => !session.started());
            expect(of('eve').tableSeats.seats()).toEqual(['alice', 'bob', 'carol', null, null, null, null, null]);
            expect([of('eve').played().attempt, of('eve').setup()]).toEqual([1, null]);

            // When the late part comes, then the game starts again
            hub.release();
            of('bob').start(SCORE);

            // Then
            await settled((session: MinoritySession) => session.asker() !== null);
            expect([of('alice').players(), of('alice').setup()]).toEqual([['alice', 'bob', 'carol'], SCORE]);
        });
    });

    test('should keep the vote sealed by a player who reloads the page, and reveal it', async () => {
        // Given
        await started();
        await asked();
        await of('bob').vote(NO);
        await settled((session: MinoritySession) => session.game()?.committed().length === 1);

        // When Bob reloads the page
        of('bob').destroy();
        hub.close(rooms.get('bob') as Room<MinorityPayloads>);
        const reloaded: MinoritySession = page('bob');
        const caughtUp = vi.fn();
        reloaded.caughtUp.subscribe(caughtUp);
        hub.replay(rooms.get('bob') as Room<MinorityPayloads>);
        await eventually(() => expect(reloaded.myVote()).toEqual(NO));

        // Then
        expect(reloaded.canVote()).toBe(false);

        // When
        await voted([YES, undefined, YES, YES]);

        // Then
        expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 2, 3] });
        expect(caughtUp).toHaveBeenCalledOnce();
    });

    test('should reveal the vote of the first commitment of the local player, a second one sealed meanwhile ignored', async () => {
        // Given
        await started();
        await asked();
        hub.hold('bob');
        await of('bob').vote(NO);

        // When Bob reloads the page before his commitment is in the chain, and votes again
        of('bob').destroy();
        hub.close(rooms.get('bob') as Room<MinorityPayloads>);
        const reloaded: MinoritySession = page('bob');
        hub.replay(rooms.get('bob') as Room<MinorityPayloads>);
        await eventually(() => expect(reloaded.canVote()).toBe(true));
        await reloaded.vote(YES);
        hub.release();
        await voted([YES, undefined, YES, YES]);

        // Then
        expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.MINORITY, eliminated: [0, 2, 3] });
        expect(hub.reports).toEqual([]);
    });

    test('should play a new game once the former one is over, with its own setup and commitments', async () => {
        // Given
        await started();
        await asked();
        await voted([YES, YES, YES, NO]);
        await settled((session: MinoritySession) => session.over());

        // When
        of('eve').rematch();
        of('bob').rematch();
        of('carol').rematch();

        // Then
        await settled((session: MinoritySession) => session.pastGames().length === 1);
        expect([of('eve').started(), of('eve').played().index, of('eve').pastGames()[0].result()?.winners]).toEqual([false, 1, [3]]);
        expect([of('alice').canStart(), of('bob').myVote(), of('eve').setup()]).toEqual([true, null, null]);

        // When
        of('dave').start(SCORE);
        await settled((session: MinoritySession) => session.asker() !== null);
        await asked();
        await voted([YES, YES, NO, NO]);

        // Then
        expect(lastEvent()).toMatchObject({ outcome: VoteOutcome.TIE, points: [] });
        expect(gameOf('eve').variant).toEqual(MinorityVariant.SCORE);
        expect(hub.reports).toEqual([]);
    });

    test('should commit again to the random part of the draw it stored, its page reloaded before its commitment came back', async () => {
        // Given
        await seated();
        hub.hold('dave');
        of('alice').start(ELIMINATION);
        await settled((session: MinoritySession) => session.awaited().length === 1);

        // When Dave reloads the page, his commitment still waiting for the chain
        of('dave').destroy();
        hub.close(rooms.get('dave') as Room<MinorityPayloads>);
        const reloaded: MinoritySession = page('dave');
        hub.replay(rooms.get('dave') as Room<MinorityPayloads>);
        await eventually(() => expect(hub.held).toHaveLength(2));
        hub.release();

        // Then both commitments are the same: the part revealed matches the first one
        await settled((session: MinoritySession) => session.asker() !== null);
        const [first, second] = messagesOf(MGGameSessionType.DRAW, 'dave');
        expect(first.payload).toEqual(second.payload);
        expect(reloaded.game()).not.toBeNull();
        expect(hub.reports).toEqual([]);
    });

    test('should free the seat of a player away, before the game starts', async () => {
        // Given
        await seated();
        hub.leave(rooms.get('dave') as Room<MinorityPayloads>);
        of('dave').destroy();
        sessions.delete('dave');

        // When
        of('alice').unseat(3);

        // Then
        await settled((session: MinoritySession) => session.players().length === 3);
        of('alice').leaveSeat();
        await eventually(() => expect(of('eve').players()).toEqual(['bob', 'carol']));
    });
});
