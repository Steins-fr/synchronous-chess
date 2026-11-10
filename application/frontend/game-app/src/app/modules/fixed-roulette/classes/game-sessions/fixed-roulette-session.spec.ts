import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { commitmentOf } from '@app/modules/commit-reveal/classes/commitment';
import { FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SealedStore } from '@app/modules/commit-reveal/classes/sealed-store';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { drawCroupier } from '../rules/croupier';
import {
    CheatKind, FixedRouletteEvent, FixedRouletteEventKind, FixedRouletteGameState, FixedRoulettePhase, MatchEnd, SettledEvent,
} from '../rules/fixed-roulette-game-state';
import { Bets, FIXED_ROULETTE_RULES, FixedRouletteRules, FixedRouletteSetup, Side } from '../rules/fixed-roulette-rules';
import { netOf, SettlementCase } from '../rules/settlement';
import { FixedRoulettePayloads, fixedRouletteBlockChains, FRGameSessionType } from './fixed-roulette-messages';
import { FixedRouletteSession } from './fixed-roulette-session';

/** Two games a match: the specs play one to its end quickly. The reveal keeps its time, beyond the watch of the censorship */
const LIGHT: FixedRouletteRules = { ...FIXED_ROULETTE_RULES, games: 2 };
const PLAYERS: ReadonlyArray<string> = ['alice', 'bob'];
const SETUP: FixedRouletteSetup = { betTime: 60 };
const QUICK: FixedRouletteSetup = { betTime: 30 };
/** The bets of the issue: the croupier 15 on the second pocket and 50 on the third, the punter 35 on the second and 30 on the fourth */
const CROUPIER_BETS: Bets = [0, 15, 50, 0];
const PUNTER_BETS: Bets = [0, 35, 0, 30];
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const COMMITMENT: string = 'c'.repeat(64);
const ROUND = { game: 0, attempt: 0 };

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing the messages of a type */
function tampering(type: FRGameSessionType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });
const settledGames = (session: FixedRouletteSession): number =>
    session.game()?.events().filter((event: Readonly<FixedRouletteEvent>) => event.kind === FixedRouletteEventKind.SETTLED).length ?? 0;
const balls = (name: string): string | null => sessionStorage.getItem(`synchronous-chess:sealed-balls:room:${ name }`);

describe('FixedRouletteSession', { timeout: 30_000 }, () => {
    let hub: RoomHub<FixedRoulettePayloads>;
    let rooms: Map<string, Room<FixedRoulettePayloads>>;
    let sessions: Map<string, FixedRouletteSession>;

    function page(name: string, tamper?: Tamper): FixedRouletteSession {
        const room: Room<FixedRoulettePayloads> = hub.room(name, tamper);
        const session = new FixedRouletteSession(room, { rules: LIGHT });
        rooms.set(name, room);
        sessions.set(name, session);
        return session;
    }

    const of = (name: string): FixedRouletteSession => sessions.get(name) as FixedRouletteSession;
    const gameOf = (name: string): FixedRouletteGameState => of(name).game() as FixedRouletteGameState;
    const lastEvent = (): Readonly<FixedRouletteEvent> | undefined => gameOf('eve').events().at(-1);
    /** The latest game settled, none before the first one */
    const lastSettled = (): SettledEvent | undefined =>
        gameOf('eve').events().filter((event: Readonly<FixedRouletteEvent>): event is SettledEvent => event.kind === FixedRouletteEventKind.SETTLED).at(-1);
    const croupier = (): string => of('eve').croupier() as string;
    const punter = (): string => of('eve').punter() as string;

    /** What every page shows of the match: a message ignored changes none of it */
    const snapshot = (): ReadonlyArray<unknown> => [...sessions.values()].map((session: FixedRouletteSession) => {
        const game: FixedRouletteGameState | null = session.game();
        return [session.step(), game?.chips(), game?.bets(), game?.phase()];
    });

    /** Waits until every page passes the check */
    async function settled(check: (session: FixedRouletteSession) => boolean): Promise<void> {
        await eventually(() => sessions.forEach((session: FixedRouletteSession) => expect(check(session)).toBe(true)));
    }

    /** Alice and Bob seated, Eve watching */
    async function seated(tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        PLAYERS.forEach((name: string) => page(name, tampers[name]));
        page('eve');
        PLAYERS.forEach((name: string, seat: number) => of(name).takeSeat(seat));
        await settled((session: FixedRouletteSession) => session.players().length === 2);
    }

    /** The players seated, Alice starts the match: every page draws the same croupier */
    async function started(setup: FixedRouletteSetup = SETUP, tampers: Readonly<Record<string, Tamper>> = {}): Promise<void> {
        await seated(tampers);
        of('alice').start(setup);
        await settled((session: FixedRouletteSession) => session.game() !== null);
    }

    /** The croupier places the ball and bets: the punter bets next on every page */
    async function placed(pocket: number, bets: Bets = CROUPIER_BETS): Promise<void> {
        await of(croupier()).place(pocket, bets);
        await settled((session: FixedRouletteSession) => session.game()?.phase() === FixedRoulettePhase.BETTING);
    }

    /** The croupier places the ball and bets, the punter bets, then every page settles the game */
    async function played(pocket: number, croupierBets: Bets = CROUPIER_BETS, punterBets: Bets = PUNTER_BETS): Promise<void> {
        const before: number = settledGames(of('eve'));
        await placed(pocket, croupierBets);
        of(punter()).bet(punterBets);
        await settled((session: FixedRouletteSession) => settledGames(session) > before || session.over());
    }

    /** Every game of the match played */
    async function playedThrough(): Promise<void> {
        for (let round = 0; round < LIGHT.games; round++) {
            await played(1, [1, 0, 0, 0], [1, 0, 0, 0]);
        }
        await settled((session: FixedRouletteSession) => session.over());
    }

    function messagesOf(type: FRGameSessionType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    /** A claim of a timeout, at a time of the chain */
    function claim(name: string, at: number = LATER): void {
        hub.time = at;
        of(name).claimTimeout();
    }

    /** The player reloads the page: its new page catches up with the chain */
    function reloaded(name: string): FixedRouletteSession {
        of(name).destroy();
        hub.close(rooms.get(name) as Room<FixedRoulettePayloads>);
        const session: FixedRouletteSession = page(name);
        hub.replay(rooms.get(name) as Room<FixedRoulettePayloads>);
        return session;
    }

    /** The player leaves the room, its page closed */
    function left(name: string): void {
        hub.leave(rooms.get(name) as Room<FixedRoulettePayloads>);
        of(name).destroy();
        sessions.delete(name);
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<FixedRoulettePayloads>();
        rooms = new Map();
        sessions = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: FixedRouletteSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should play the rules of the manga by default', () => {
        expect(new FixedRouletteSession(hub.room('zoe')).rules).toBe(FIXED_ROULETTE_RULES);
    });

    test('should route every message of the game to its chain', () => {
        expect(Object.keys(fixedRouletteBlockChains)).toEqual(Object.values(FRGameSessionType));
        expect(new Set(Object.values(fixedRouletteBlockChains))).toEqual(new Set([BlockChainName.FIXED_ROULETTE]));
    });

    describe('the start', () => {
        test('should let a seated player start once both seats are taken, every page drawing the same croupier', async () => {
            // Given
            ['alice', 'bob', 'eve'].forEach((name: string) => page(name));
            of('alice').takeSeat(0);
            await settled((session: FixedRouletteSession) => session.players().length === 1);

            // Then nobody starts, places nor bets
            expect([of('alice').canStart(), of('alice').canPlace(), of('alice').canBet(), of('alice').myChips(), of('alice').game(), of('alice').myBall()])
                .toEqual([false, false, false, null, null, null]);
            expect([of('eve').croupier(), of('eve').punter(), of('eve').awaited(), of('eve').setup(), of('eve').myChips()]).toEqual([null, null, [], null, null]);
            of('alice').start(SETUP);
            await of('alice').place(1, [1, 0, 0, 0]);
            of('alice').bet([1, 0, 0, 0]);
            expect(hub.delivered).toHaveLength(1);

            // When
            of('bob').takeSeat(1);
            await settled((session: FixedRouletteSession) => session.players().length === 2);

            // Then
            expect([of('alice').canStart(), of('bob').canStart(), of('eve').canStart()]).toEqual([true, true, false]);
            expect([of('alice').started(), of('alice').seatsOpen(), of('alice').inMatch()]).toEqual([false, true, false]);

            // When
            of('alice').start(SETUP);

            // Then the seats close at once, the players draw the seed
            await settled((session: FixedRouletteSession) => session.started());
            expect([of('bob').seatsOpen(), of('bob').inMatch(), of('eve').inMatch(), of('eve').setup()]).toEqual([false, true, false, SETUP]);
            await settled((session: FixedRouletteSession) => session.game() !== null);
            // The start, then the commitment and the part of each player
            expect(messagesOf(FRGameSessionType.DRAW)).toHaveLength(5);
            const seed: string = await (of('eve').played().draw as FairDraw).seed() as string;
            const first: number = await drawCroupier(seed, LIGHT);
            sessions.forEach((session: FixedRouletteSession) => expect([session.game()?.first, session.game()?.setup]).toEqual([first, SETUP]));
            expect([croupier(), punter()]).toEqual([PLAYERS[first], PLAYERS[1 - first]]);
            expect([of('eve').step(), of('eve').awaited(), of('eve').phaseTime()]).toEqual([2, [croupier()], SETUP.betTime]);
            expect([of(croupier()).canPlace(), of(punter()).canPlace(), of(punter()).canBet(), of('eve').canPlace()]).toEqual([true, false, false, false]);
            expect([of(croupier()).myIndex(), of(punter()).myIndex(), of('eve').myIndex()]).toEqual([gameOf('eve').croupier(), gameOf('eve').punter(), null]);
            expect([of('alice').myChips(), of('bob').myChips(), of('eve').myChips(), of(croupier()).myBall()]).toEqual([LIGHT.startChips, LIGHT.startChips, null, null]);
            expect(hub.reports).toEqual([]);
            // Their parts in the chain, the pages keep them no more
            expect(sessionStorage.getItem('synchronous-chess:sealed-draws:room:alice')).toEqual('{}');
        });

        test('should send no start with a setup the rules do not offer, and report one', async () => {
            // Given
            await seated();

            // When
            of('alice').start({ betTime: 45 });
            hub.send({ from: 'bob', type: FRGameSessionType.DRAW, payload: { ...ROUND, players: PLAYERS, betTime: 90 } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } bob`));
            expect(messagesOf(FRGameSessionType.DRAW)).toHaveLength(1);
            expect(of('eve').started()).toBe(false);
        });

        test('should ignore a start naming other players than the seated ones, of a spectator, of another match, or once started', async () => {
            // Given
            await seated();
            const start = { ...ROUND, players: PLAYERS, ...SETUP };

            // When
            hub.send({ from: 'alice', type: FRGameSessionType.COMMIT, payload: { ...ROUND, round: 0, bets: CROUPIER_BETS, commitment: COMMITMENT } });
            hub.send({ from: 'bob', type: FRGameSessionType.BET, payload: { ...ROUND, round: 0, bets: PUNTER_BETS } });
            hub.send({ from: 'alice', type: FRGameSessionType.REVEAL, payload: { ...ROUND, round: 0, pocket: 1, salt: 'salt' } });
            hub.send({ from: 'alice', type: FRGameSessionType.DRAW, payload: { ...start, players: ['bob', 'alice'] } });
            hub.send({ from: 'eve', type: FRGameSessionType.DRAW, payload: start });
            hub.send({ from: 'alice', type: FRGameSessionType.DRAW, payload: { ...start, game: 1 } });
            of('alice').start(SETUP);
            hub.send({ from: 'bob', type: FRGameSessionType.DRAW, payload: { ...start, betTime: 300 } });
            await settled((session: FixedRouletteSession) => session.game() !== null);

            // Then
            expect([of('eve').players(), of('eve').setup(), hub.reports]).toEqual([PLAYERS, SETUP, []]);
        });

        test('should draw the same croupier on a page joining late, with the same games', async () => {
            // Given
            await started();
            await played(2);

            // When Zoe joins the room
            const late: FixedRouletteSession = page('zoe');
            hub.replay(rooms.get('zoe') as Room<FixedRoulettePayloads>);

            // Then
            await eventually(() => expect(late.game()?.events()).toEqual(gameOf('eve').events()));
            expect([late.croupier(), late.game()?.chips()]).toEqual([croupier(), gameOf('eve').chips()]);
        });
    });

    describe('a match', () => {
        test('should play every game of the match, the players swapping their roles, then tell the winner', async () => {
            // Given
            await started(QUICK);
            const first: string = croupier();

            // When the ball falls in the second pocket: both sides on it share the chips of the others
            await played(2);

            // Then
            const split: SettledEvent = lastSettled() as SettledEvent;
            expect(split).toMatchObject({ round: 0, croupier: PLAYERS.indexOf(first), ball: 2, settlement: { kind: SettlementCase.SPLIT, leftover: 0 } });
            expect([Side.CROUPIER, Side.PUNTER].map((side: Side) => netOf(split.settlement, split.bets, side))).toEqual([-26, 26]);
            expect(of(first).myChips()).toEqual(LIGHT.startChips - 26);
            expect([croupier(), of('eve').phaseTime(), of(first).myIndex()]).toEqual([PLAYERS.find((name: string) => name !== first), QUICK.betTime, gameOf('eve').punter()]);

            // When the ball falls in the fourth pocket, only the punter on it
            await played(4);

            // Then the match is over, the first croupier winning: 474 + 65 against 526 - 65
            await settled((session: FixedRouletteSession) => session.over());
            expect(of('eve').played().result()).toEqual({
                winner: PLAYERS.indexOf(first), end: MatchEnd.GAMES, cause: null,
                chips: first === 'alice' ? [539, 461] : [461, 539],
            });
            expect([of('alice').inMatch(), of('alice').seatsOpen(), of(first).myBall(), of('eve').awaited()]).toEqual([false, true, null, []]);
            expect(hub.reports).toEqual([]);
            PLAYERS.forEach((name: string) => expect(balls(name)).toEqual('{}'));
        });

        test('should seal the ball from every other page until the punter bet, the punter ordering the chain included', async () => {
            // Given
            await started();
            hub.sequencer.set(punter());

            // When
            await placed(3);

            // Then only the page of the croupier knows the ball
            expect([of(croupier()).myBall(), of(croupier()).canPlace(), of(croupier()).sending()]).toEqual([3, false, false]);
            [punter(), 'eve'].forEach((name: string) => expect([of(name).myBall(), balls(name)]).toEqual([null, null]));
            expect(messagesOf(FRGameSessionType.COMMIT).map((message: AppMessage) => message.payload)).toEqual([
                { ...ROUND, round: 0, bets: CROUPIER_BETS, commitment: expect.stringMatching(/^[0-9a-f]{64}$/) },
            ]);
            expect(JSON.stringify(hub.delivered)).not.toContain('pocket');
            // The bets of the croupier leave its chips, public
            expect([of(croupier()).myChips(), gameOf('eve').bets()]).toEqual([LIGHT.startChips - 65, { [Side.CROUPIER]: CROUPIER_BETS, [Side.PUNTER]: null }]);
            expect([of('eve').awaited(), of('eve').phaseTime(), of(punter()).canBet(), of(croupier()).canBet()]).toEqual([[punter()], SETUP.betTime, true, false]);

            // When
            of(punter()).bet(PUNTER_BETS);

            // Then the page of the croupier reveals its ball once the punter bet
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            const types: string[] = hub.types();
            expect(types.indexOf(FRGameSessionType.REVEAL)).toBeGreaterThan(types.indexOf(FRGameSessionType.BET));
            expect(messagesOf(FRGameSessionType.REVEAL)[0].payload).toEqual({ ...ROUND, round: 0, pocket: 3, salt: expect.any(String) });
            expect(lastEvent()).toMatchObject({ ball: 3, settlement: { kind: SettlementCase.CROUPIER } });
            expect(hub.reports).toEqual([]);
        });

        test('should send no ball off the wheel, no bets the rules refuse, nor bets of another player than the one awaited', async () => {
            // Given
            await started();

            // When
            await of(croupier()).place(5, CROUPIER_BETS);
            await of(croupier()).place(1, [0, 0, 0, 0]);
            await of(croupier()).place(1, [LIGHT.startChips + 1, 0, 0, 0]);
            await of(punter()).place(1, CROUPIER_BETS);
            await of('eve').place(1, CROUPIER_BETS);
            of(punter()).bet(PUNTER_BETS);

            // Then
            expect([messagesOf(FRGameSessionType.COMMIT), messagesOf(FRGameSessionType.BET)]).toEqual([[], []]);

            // When the punter bets on 3 pockets, then less than the croupier
            await placed(2);
            of(punter()).bet([10, 30, 0, 30]);
            of(punter()).bet([0, 30, 0, 30]);
            of(croupier()).bet(PUNTER_BETS);

            // Then
            expect(messagesOf(FRGameSessionType.BET)).toEqual([]);
        });
    });

    describe('the order of the moves', () => {
        test('should ignore a bet of the punter before the croupier bet, and a commitment once the punter bet', async () => {
            // Given
            await started();
            const before: ReadonlyArray<unknown> = snapshot();

            // When the punter bets first
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...ROUND, round: 0, bets: PUNTER_BETS } });
            await new Promise((resolve) => setTimeout(resolve));

            // Then
            expect(snapshot()).toEqual(before);

            // When the croupier commits again once the punter bet, its reveal held
            await placed(2);
            hub.hold(croupier());
            of(punter()).bet(PUNTER_BETS);
            await settled((session: FixedRouletteSession) => session.game()?.phase() === FixedRoulettePhase.REVEALING);
            const revealing: ReadonlyArray<unknown> = snapshot();
            hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: { ...ROUND, round: 0, bets: [0, 0, 0, 100], commitment: COMMITMENT } });
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...ROUND, round: 0, bets: [0, 100, 0, 0] } });
            await new Promise((resolve) => setTimeout(resolve));

            // Then
            expect([snapshot(), hub.reports]).toEqual([revealing, []]);
            hub.release();
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ ball: 2, bets: { [Side.CROUPIER]: CROUPIER_BETS, [Side.PUNTER]: PUNTER_BETS } });
        });

        test('should report a commitment of the punter, malformed, or with bets the rules refuse, and ignore the others', async () => {
            // Given
            await started();
            const commit = { ...ROUND, round: 0, bets: CROUPIER_BETS, commitment: COMMITMENT };

            // When
            hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: { ...commit, commitment: 'malformed' } });
            hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: { ...commit, bets: [1, 2, 3] } });
            hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: { ...commit, bets: [0, 0, 0, 0] } });
            hub.send({ from: punter(), type: FRGameSessionType.COMMIT, payload: commit });
            [{ round: 1 }, { game: 1 }, { attempt: 1 }].forEach((change: object) =>
                hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: { ...commit, ...change } }));
            hub.send({ from: 'eve', type: FRGameSessionType.COMMIT, payload: commit });

            // Then the croupier still places its ball
            await eventually(() => expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([
                `eve ${ CheatReason.INVALID_MESSAGE } ${ croupier() }`, `eve ${ CheatReason.INVALID_MESSAGE } ${ croupier() }`,
                `eve ${ CheatReason.ILLEGAL_MOVE } ${ croupier() }`, `eve ${ CheatReason.ILLEGAL_MOVE } ${ punter() }`,
            ]));
            expect([gameOf('eve').phase(), gameOf('eve').events(), of('eve').awaited(), of(croupier()).canPlace()])
                .toEqual([FixedRoulettePhase.PLACING, [], [croupier()], true]);

            // When
            await placed(1);

            // Then the first commitment taken counts, a second one ignored
            hub.send({ from: croupier(), type: FRGameSessionType.COMMIT, payload: commit });
            expect([gameOf('eve').events().length, of(croupier()).myBall()]).toEqual([1, 1]);
        });

        test('should report a bet of the croupier, malformed, or the rules refuse, the punter still awaited, and ignore the others', async () => {
            // Given
            await started();
            await placed(2);
            const bet = { ...ROUND, round: 0, bets: PUNTER_BETS };

            // When
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...bet, bets: [0, -35, 0, 100] } });
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...bet, bets: [10, 35, 0, 30] } });
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...bet, bets: [0, 35, 0, 0] } });
            hub.send({ from: croupier(), type: FRGameSessionType.BET, payload: bet });
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...bet, round: 1 } });
            hub.send({ from: punter(), type: FRGameSessionType.BET, payload: { ...bet, game: 1 } });
            hub.send({ from: 'eve', type: FRGameSessionType.BET, payload: bet });

            // Then
            await eventually(() => expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([
                `eve ${ CheatReason.INVALID_MESSAGE } ${ punter() }`, `eve ${ CheatReason.ILLEGAL_MOVE } ${ punter() }`,
                `eve ${ CheatReason.ILLEGAL_MOVE } ${ punter() }`, `eve ${ CheatReason.ILLEGAL_MOVE } ${ croupier() }`,
            ]));
            expect([gameOf('eve').phase(), of('eve').awaited(), of(punter()).canBet()]).toEqual([FixedRoulettePhase.BETTING, [punter()], true]);

            // When
            of(punter()).bet(PUNTER_BETS);

            // Then
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
        });
    });

    describe('the cheats', () => {
        test.each([
            { name: 'with another salt', change: (payload: { salt: string }) => ({ ...payload, salt: `${ payload.salt }0` }) },
            { name: 'without its salt', change: (payload: object) => ({ ...payload, salt: undefined }) },
            { name: 'in another pocket', change: (payload: { pocket: number }) => ({ ...payload, pocket: payload.pocket % 4 + 1 }) },
            { name: 'as a text', change: (payload: { pocket: number }) => ({ ...payload, pocket: String(payload.pocket) }) },
        ])('should report a ball revealed $name: the croupier forfeits the match, the bets back to their owners', async ({ change }) => {
            // Given
            await started(SETUP, { alice: tampering(FRGameSessionType.REVEAL, change), bob: tampering(FRGameSessionType.REVEAL, change) });
            const cheat: string = croupier();

            // When
            await played(2);

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } ${ cheat }`);
            expect(lastEvent()).toEqual({ kind: FixedRouletteEventKind.CHEATED, round: 0, player: PLAYERS.indexOf(cheat), reason: CheatKind.INVALID_REVEAL });
            expect(of('eve').played().result()).toEqual({
                winner: 1 - PLAYERS.indexOf(cheat), end: MatchEnd.CHEAT, cause: CheatKind.INVALID_REVEAL, chips: [LIGHT.startChips, LIGHT.startChips],
            });
            // Refused, the ball leaves the tab of the croupier
            expect(balls(cheat)).toEqual('{}');
        });

        test('should report a ball off the wheel, matching its commitment, and ignore a reveal not awaited', async () => {
            // Given the croupier commits to the pocket 5
            await started();
            const cheat: number = gameOf('eve').croupier();
            const id: string = of('eve').played().id();
            const reveal = { ...ROUND, round: 0, pocket: 5, salt: 'salt' };
            hub.send({
                from: croupier(), type: FRGameSessionType.COMMIT,
                payload: { ...ROUND, round: 0, bets: CROUPIER_BETS, commitment: await commitmentOf([id, 'ball', cheat, 0, 5, 'salt'], ':') },
            });
            await settled((session: FixedRouletteSession) => session.game()?.phase() === FixedRoulettePhase.BETTING);
            hub.send({ from: croupier(), type: FRGameSessionType.REVEAL, payload: reveal });

            // When
            of(punter()).bet(PUNTER_BETS);
            await settled((session: FixedRouletteSession) => session.game()?.phase() === FixedRoulettePhase.REVEALING);
            hub.send({ from: punter(), type: FRGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: 'eve', type: FRGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: croupier(), type: FRGameSessionType.REVEAL, payload: { ...reveal, round: 1 } });
            hub.send({ from: croupier(), type: FRGameSessionType.REVEAL, payload: reveal });

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([`eve ${ CheatReason.ILLEGAL_MOVE } ${ croupier() }`]);
            expect(of('eve').played().result()).toMatchObject({ winner: 1 - cheat, end: MatchEnd.CHEAT, cause: CheatKind.ILLEGAL_POCKET });
        });
    });

    describe('the timeouts', () => {
        test('should make the croupier forfeit the match once it does not place the ball in time', async () => {
            // Given
            await started();
            const late: string = croupier();

            // When
            claim(punter());

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(lastEvent()).toEqual({ kind: FixedRouletteEventKind.LATE, round: 0, player: PLAYERS.indexOf(late), phase: FixedRoulettePhase.PLACING });
            expect(of('eve').played().result()).toEqual({
                winner: 1 - PLAYERS.indexOf(late), end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.PLACING, chips: [LIGHT.startChips, LIGHT.startChips],
            });
        });

        test('should make the punter forfeit the match once it does not bet in time, the bets of the croupier back to it', async () => {
            // Given
            await started();
            await placed(2);
            const late: string = punter();

            // When
            claim(croupier());

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(of('eve').played().result()).toMatchObject({ winner: 1 - PLAYERS.indexOf(late), end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.BETTING });
            expect([of('alice').myChips(), of('bob').myChips(), of(croupier()).myBall()]).toEqual([LIGHT.startChips, LIGHT.startChips, null]);
            // The game over live, the seal of the croupier leaves its tab
            expect(balls(croupier())).toEqual('{}');
        });

        test('should make the croupier forfeit the match once it does not reveal the ball in time', async () => {
            // Given the reveal of the croupier never counts
            const lost: Tamper = tampering(FRGameSessionType.REVEAL, (payload: object) => ({ ...payload, game: 9 }));
            await started(SETUP, { alice: lost, bob: lost });
            const late: string = croupier();
            await placed(2);
            of(punter()).bet(PUNTER_BETS);
            await eventually(() => expect(messagesOf(FRGameSessionType.REVEAL)).toHaveLength(1));
            expect([of(late).myBall(), of('eve').phaseTime(), of('eve').awaited()]).toEqual([2, LIGHT.revealTime, [late]]);

            // When
            claim(punter());

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(of('eve').played().result()).toMatchObject({
                winner: 1 - PLAYERS.indexOf(late), end: MatchEnd.FORFEIT, cause: FixedRoulettePhase.REVEALING, chips: [LIGHT.startChips, LIGHT.startChips],
            });
            // Withheld, the ball leaves the tab of the croupier
            expect(balls(late)).toEqual('{}');
        });

        test('should void a claim coming before the time of the bets, its claimer waiting again', async () => {
            // Given
            hub.time = 1_000;
            await started();

            // When
            claim(punter(), 1_000 + (SETUP.betTime - 3) * 1000);
            await settled((session: FixedRouletteSession) => !session.sending());

            // Then
            expect([of(punter()).voidedClaims(), of(croupier()).voidedClaims(), gameOf('eve').phase()]).toEqual([1, 0, FixedRoulettePhase.PLACING]);

            // When
            claim(punter(), 1_000 + (SETUP.betTime - 2) * 1000);

            // Then
            await settled((session: FixedRouletteSession) => session.over());
            expect(lastEvent()).toMatchObject({ kind: FixedRouletteEventKind.LATE });
        });

        test('should ignore a claim of a step past, of a spectator, of another match, once the match is over, and a rematch before', async () => {
            // Given
            await started();
            const step: number = of('eve').step();
            await placed(2);

            // When
            hub.time = LATER;
            hub.send({ from: punter(), type: FRGameSessionType.TIMEOUT, payload: { ...ROUND, step } });
            hub.send({ from: 'eve', type: FRGameSessionType.TIMEOUT, payload: { ...ROUND, step: of('eve').step() } });
            hub.send({ from: croupier(), type: FRGameSessionType.TIMEOUT, payload: { ...ROUND, game: 1, step: of('eve').step() } });
            of(croupier()).rematch();
            await settled((session: FixedRouletteSession) => !session.sending());
            of(punter()).bet(PUNTER_BETS);

            // Then
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            expect([of('eve').over(), of('eve').pastGames()]).toEqual([false, []]);

            // When the match is over
            await played(1, [1, 0, 0, 0], [1, 0, 0, 0]);
            await settled((session: FixedRouletteSession) => session.over());
            const events: number = gameOf('eve').events().length;
            claim('bob');

            // Then
            await settled((session: FixedRouletteSession) => !session.sending());
            expect(gameOf('eve').events()).toHaveLength(events);
        });

        test('should open the seats again once the draw times out, the seat of its late player freed', async () => {
            // Given
            hub.time = 0;
            await seated();
            hub.hold('bob');
            of('alice').start(SETUP);
            await settled((session: FixedRouletteSession) => session.awaited().length === 1);
            expect([of('eve').awaited(), of('eve').phaseTime(), of('eve').croupier()]).toEqual([['bob'], LIGHT.drawTime, null]);

            // When
            claim('alice', LIGHT.drawTime * 1000);

            // Then
            await settled((session: FixedRouletteSession) => !session.started());
            expect([of('eve').tableSeats.seats(), of('eve').played().attempt, of('eve').setup(), of('alice').canStart()]).toEqual([['alice', null], 1, null, false]);

            // When the late part comes, Bob sits again, then the match starts again
            hub.release();
            of('bob').takeSeat(1);
            await settled((session: FixedRouletteSession) => session.players().length === 2);
            of('bob').start(QUICK);

            // Then
            await settled((session: FixedRouletteSession) => session.game() !== null);
            expect([of('alice').players(), of('alice').setup()]).toEqual([PLAYERS, QUICK]);
        });
    });

    describe('a reload', () => {
        test('should let the croupier place the ball once it reloads the page while placing', async () => {
            // Given
            await started();
            const name: string = croupier();

            // When
            const again: FixedRouletteSession = reloaded(name);
            await eventually(() => expect(again.canPlace()).toBe(true));
            await played(4);

            // Then
            expect(lastSettled()).toMatchObject({ ball: 4, settlement: { kind: SettlementCase.PUNTER } });
        });

        test('should keep the ball sealed by a croupier who reloads the page while the punter bets, and reveal it, the punter betting after a reload', async () => {
            // Given
            await started();
            await placed(3);
            const croupierName: string = croupier();
            const punterName: string = punter();

            // When
            const croupierPage: FixedRouletteSession = reloaded(croupierName);
            const punterPage: FixedRouletteSession = reloaded(punterName);
            await eventually(() => expect([croupierPage.myBall(), punterPage.canBet()]).toEqual([3, true]));

            // Then
            expect([croupierPage.canPlace(), punterPage.myBall(), croupierPage.myIndex()]).toEqual([false, null, gameOf('eve').croupier()]);

            // When
            punterPage.bet(PUNTER_BETS);

            // Then
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ ball: 3, settlement: { kind: SettlementCase.CROUPIER } });
            expect(hub.reports).toEqual([]);
        });

        test('should reveal the ball again once the croupier reloads the page while revealing, the first reveal counting', async () => {
            // Given
            await started();
            await placed(2);
            const name: string = croupier();
            hub.hold(name);
            of(punter()).bet(PUNTER_BETS);
            await eventually(() => expect(hub.held).toHaveLength(1));

            // When
            const again: FixedRouletteSession = reloaded(name);
            await eventually(() => expect(hub.held).toHaveLength(2));
            expect(again.myBall()).toEqual(2);
            hub.release();

            // Then
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            expect([lastSettled()?.ball, again.myBall()]).toEqual([2, null]);
            expect(hub.reports).toEqual([]);
        });

        test('should reveal the ball of the first commitment of the croupier, a second one sealed meanwhile ignored', async () => {
            // Given
            await started();
            const name: string = croupier();
            hub.hold(name);
            await of(name).place(1, CROUPIER_BETS);

            // When the croupier reloads the page before its commitment is in the chain, and places again
            const again: FixedRouletteSession = reloaded(name);
            await eventually(() => expect(again.canPlace()).toBe(true));
            await again.place(3, CROUPIER_BETS);
            hub.release();
            await settled((session: FixedRouletteSession) => session.game()?.phase() === FixedRoulettePhase.BETTING);
            of(punter()).bet(PUNTER_BETS);

            // Then
            await settled((session: FixedRouletteSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ ball: 1, settlement: { kind: SettlementCase.BANK, bank: 130 } });
            expect(hub.reports).toEqual([]);
            expect(balls(name)).toEqual('{}');
        });
    });

    describe('a new match', () => {
        test('should play a new match once the former one is over, with its own setup and seals', async () => {
            // Given
            await started();
            await playedThrough();

            // When
            of('eve').rematch();
            of('bob').rematch();
            of('alice').rematch();

            // Then
            await settled((session: FixedRouletteSession) => session.pastGames().length === 1);
            expect([of('eve').started(), of('eve').played().index, of('eve').pastGames()[0].result()?.winner]).toEqual([false, 1, null]);
            expect([of('alice').canStart(), of('alice').myChips(), of('eve').setup(), of('eve').croupier()]).toEqual([true, null, null, null]);

            // When
            of('bob').start(QUICK);
            await settled((session: FixedRouletteSession) => session.game() !== null);
            await played(2);

            // Then
            expect([of('eve').setup(), of('eve').played().index, gameOf('eve').round()]).toEqual([QUICK, 1, 1]);
            expect(hub.reports).toEqual([]);
        });

        test('should clear the seals left once the match is over, a page reloaded in the next match keeping its ball', async () => {
            // Given the seal of a commitment of Alice lost on its way
            new SealedStore<unknown>('balls', 'room', 'alice').save('lost', { pocket: 1, salt: 'salt' });
            await started();

            // When
            await playedThrough();

            // Then
            await eventually(() => expect(balls('alice')).toEqual('{}'));
            const firstMatch: number = hub.delivered.length;

            // When the croupier places in the next match, then reloads the page, its history caught up in two parts: the first match over
            ['eve', 'bob'].forEach((name: string) => of(name).rematch());
            await settled((session: FixedRouletteSession) => session.pastGames().length === 1);
            of('alice').start(SETUP);
            await settled((session: FixedRouletteSession) => session.game() !== null);
            await placed(4);
            const name: string = croupier();
            of(name).destroy();
            hub.close(rooms.get(name) as Room<FixedRoulettePayloads>);
            const again: FixedRouletteSession = page(name);
            hub.replay(rooms.get(name) as Room<FixedRoulettePayloads>, hub.delivered.slice(0, firstMatch));
            await eventually(() => expect(again.over()).toBe(true));
            hub.replay(rooms.get(name) as Room<FixedRoulettePayloads>, hub.delivered.slice(firstMatch));

            // Then
            await eventually(() => expect([again.played().index, again.myBall()]).toEqual([1, 4]));
        });
    });

    describe('the conversation of the players', () => {
        /** The conversation of the players of a match, as every page declares it */
        const conversation = (id: string, open: boolean): Readonly<PrivateConversation> => ({
            id, members: PLAYERS, title: { key: 'fixed.table.conversation.players', params: { first: 'alice', second: 'bob' } }, open, watched: true,
        });

        test('should declare the conversation of the players from the start of the match, closed once it is over, kept until the next match starts', async () => {
            // Given
            await seated();
            expect(of('eve').conversations()).toEqual([]);

            // When
            await started();

            // Then
            sessions.forEach((session: FixedRouletteSession) => expect(session.conversations()).toEqual([conversation('fr-0-0', true)]));

            // When
            await playedThrough();

            // Then
            expect(of('eve').conversations()).toEqual([conversation('fr-0-0', false)]);

            // When the players play again: the spectators keep reading the conversation of the match over
            ['eve', 'bob', 'alice'].forEach((name: string) => of(name).rematch());
            await settled((session: FixedRouletteSession) => session.pastGames().length === 1);

            // Then
            expect(of('eve').conversations()).toEqual([conversation('fr-0-0', false)]);

            // When
            of('bob').start(SETUP);
            await settled((session: FixedRouletteSession) => session.started());

            // Then
            sessions.forEach((session: FixedRouletteSession) => expect(session.conversations()).toEqual([conversation('fr-1-0', true)]));
        });

        test('should declare no conversation once the draw of the first match times out', async () => {
            // Given
            hub.time = 0;
            await seated();
            hub.hold('bob');
            of('alice').start(SETUP);
            await settled((session: FixedRouletteSession) => session.awaited().length === 1);
            expect(of('eve').conversations()).toEqual([conversation('fr-0-0', true)]);

            // When
            claim('alice', LIGHT.drawTime * 1000);

            // Then
            await settled((session: FixedRouletteSession) => !session.started());
            expect(of('eve').conversations()).toEqual([]);
        });
    });

    test('should free the seat of a player away, before the match starts', async () => {
        // Given
        await seated();
        left('bob');

        // When
        of('alice').unseat(1);

        // Then
        await settled((session: FixedRouletteSession) => session.players().length === 1);
        expect(of('eve').players()).toEqual(['alice']);
    });
});
