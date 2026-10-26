import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { TEST_GROUP } from '@testing/sra-test-group';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cylinder, CylinderVerification } from '../cylinder/cylinder';
import { CylinderMessageType, CylinderSpinMessage } from '../cylinder/cylinder-messages';
import { CylinderPhase } from '../cylinder/cylinder-state';
import { RouletteRules, RUSSIAN_ROULETTE_RULES } from '../rules/roulette-game';
import { RouletteSeat } from '../rules/roulette-seat';
import { PlayedGame } from './played-game';
import { rouletteBlockChains, RoulettePayloads, RRGameSessionType, RussianRouletteSession } from './russian-roulette-session';

const cipher = new ExponentialElGamal(TEST_GROUP);
const SALT: string = 'a'.repeat(32);
const { ONE, TWO } = RouletteSeat;
/** The chambers each player loads */
const LOADS: Readonly<Record<string, ReadonlyArray<number>>> = { alice: [0, 1, 3], bob: [6, 8, 11] };
/** A cylinder of fewer chambers than in a game, for the specs to run fast */
const LIGHT: RouletteRules = { ...RUSSIAN_ROULETTE_RULES, chambers: 12 };

type Tamper = (message: AppMessage) => AppMessage;

/** Lets the sessions apply the messages delivered */
const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve));

/** Waits for a check: loading the bullets checks their proofs, slower when the specs run in parallel */
const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

// A game loads and spins its cylinder, its proofs checked: slower when the specs run in parallel
describe('RussianRouletteSession', { timeout: 30_000 }, () => {
    let hub: RoomHub<RoulettePayloads>;
    let rooms: Map<string, Room<RoulettePayloads>>;
    let sessions: RussianRouletteSession[];

    function page(name: string, rules: RouletteRules = LIGHT, tamper?: Tamper): RussianRouletteSession {
        const room: Room<RoulettePayloads> = hub.room(name, tamper);
        const session = new RussianRouletteSession(room, { cipher, rules });
        rooms.set(name, room);
        sessions.push(session);
        return session;
    }

    /** Alice on the first seat, Bob on the second one, Carol watching */
    async function table(tampers: { bob?: Tamper } = {}, rules?: RouletteRules): Promise<[RussianRouletteSession, RussianRouletteSession, RussianRouletteSession]> {
        const alice: RussianRouletteSession = page('alice', rules);
        const bob: RussianRouletteSession = page('bob', rules, tampers.bob);
        const carol: RussianRouletteSession = page('carol', rules);
        alice.takeSeat(ONE);
        bob.takeSeat(TWO);
        await settled(sessions, (session: RussianRouletteSession) => session.cylinder() !== null);
        return [alice, bob, carol];
    }

    /** Waits until every participant applied the messages of the chain */
    async function settled(of: ReadonlyArray<RussianRouletteSession>, check: (session: RussianRouletteSession) => boolean): Promise<void> {
        await eventually(() => of.forEach((session: RussianRouletteSession) => expect(check(session)).toBe(true)));
    }

    /** Both players load their bullets, the cylinder spun: the player drawn plays first */
    async function loaded(alice: RussianRouletteSession, bob: RussianRouletteSession): Promise<void> {
        alice.load(LOADS['alice']);
        bob.load(LOADS['bob']);
        await settled(sessions, (session: RussianRouletteSession) => session.game().toAct() !== null);
    }

    /** The player to act shoots or passes, every participant applying it */
    async function play(move: 'pass' | 'shoot'): Promise<void> {
        const actions: number = sessions[0].game().actions().length;
        const actor: RussianRouletteSession = sessions[sessions[0].game().toAct() as RouletteSeat];
        actor[move]();
        await settled(sessions, (session: RussianRouletteSession) => session.game().actions().length > actions || session.over());
    }

    /** The players shoot until the game is over, Bob's page not disclosing his key: his other messages go on */
    async function overWithoutBobKey(alice: RussianRouletteSession, bob: RussianRouletteSession): Promise<void> {
        const carol: RussianRouletteSession = sessions[2];
        const forward = (): void => {
            const held: AppMessage[] = hub.held.splice(0);
            hub.held.push(...held.filter((message: AppMessage) => message.type === CylinderMessageType.DISCLOSE));
            held.filter((message: AppMessage) => message.type !== CylinderMessageType.DISCLOSE).forEach((message: AppMessage) => hub.send(message));
        };
        await loaded(alice, bob);
        hub.hold('bob');

        while (!carol.over()) {
            const actions: number = carol.game().actions().length;
            sessions[carol.game().toAct() as RouletteSeat].shoot();
            await eventually(() => {
                forward();
                sessions.forEach((session: RussianRouletteSession) => expect(session.game().actions().length > actions || session.over()).toBe(true));
            });
        }
        await eventually(() => {
            forward();
            expect(messagesOf(CylinderMessageType.DISCLOSE, 'alice')).toHaveLength(1);
            expect(hub.held).toHaveLength(1);
        });
    }

    function messagesOf(type: string, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<RoulettePayloads>();
        rooms = new Map();
        sessions = [];
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: RussianRouletteSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should route the game and its cylinder to the chain of the roulette', () => {
        expect(Object.values(rouletteBlockChains)).toEqual(Array.from({ length: 11 }, () => BlockChainName.ROULETTE));
        expect(Object.keys(rouletteBlockChains)).toEqual([...Object.values(RRGameSessionType), ...Object.values(CylinderMessageType)]);
    });

    describe('seats', () => {
        test('should seat the first participant asking for a free seat, each one on a single seat', async () => {
            // Given
            const alice: RussianRouletteSession = page('alice');
            const bob: RussianRouletteSession = page('bob');
            page('carol');

            // Then without a cylinder, nothing to check
            expect(alice.played().verification()).toEqual(CylinderVerification.PENDING);

            // When
            alice.takeSeat(ONE);
            bob.takeSeat(ONE);
            alice.takeSeat(TWO);
            bob.takeSeat(ONE);
            await settled(sessions, (session: RussianRouletteSession) => session.seats()[ONE] === 'bob');

            // Then
            expect(sessions.map((session: RussianRouletteSession) => session.seats())).toEqual([['bob', 'alice'], ['bob', 'alice'], ['bob', 'alice']]);
            expect(alice.mySeat()).toEqual(TWO);
            expect(sessions[2].mySeat()).toBeNull();
            expect(alice.spectatorNumber()).toEqual(1);
            expect(alice.seatsOpen()).toBe(true);
            expect(alice.players()).toEqual(['bob', 'alice']);
        });

        test('should free the seat a participant leaves, and refuse a seat without salt or out of the table', async () => {
            // Given
            const alice: RussianRouletteSession = page('alice');
            alice.takeSeat(TWO);

            // When
            alice.leaveSeat();
            rooms.get('alice')?.transmitMessage(RRGameSessionType.SEAT, { seat: ONE, salt: 'short' });
            rooms.get('alice')?.transmitMessage(RRGameSessionType.SEAT, { seat: 2 as RouletteSeat, salt: SALT });
            await flush();

            // Then
            expect(alice.seats()).toEqual([null, null]);
            expect(alice.cylinder()).toBeNull();
            expect(alice.played().players()).toEqual([null, null]);
        });

        test('should prepare the cylinder of the players of both seats, a new one when a seat changes', async () => {
            // Given
            const [alice] = await table();
            const prepared: Cylinder = alice.cylinder() as Cylinder;

            // Then
            expect(prepared.players).toEqual(['alice', 'bob']);
            expect(prepared.id).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:0$/);
            expect(alice.canLoad()).toBe(true);
            expect(sessions[2].canLoad()).toBe(false);
            expect(alice.awaited()).toEqual([]);

            // When
            alice.leaveSeat();
            page('dave').takeSeat(ONE);
            await settled(sessions, (session: RussianRouletteSession) => session.seats()[ONE] === 'dave');

            // Then
            expect(alice.cylinder()?.players).toEqual(['dave', 'bob']);
            expect(alice.cylinder()).not.toBe(prepared);
        });

        test('should keep the seats once a player loaded its bullets', async () => {
            // Given
            const [alice, bob, carol] = await table();

            // When
            alice.load(LOADS['alice']);
            await settled(sessions, (session: RussianRouletteSession) => session.started());
            bob.leaveSeat();
            carol.takeSeat(TWO);
            await flush();

            // Then
            expect(carol.seats()).toEqual(['alice', 'bob']);
            expect(carol.players()).toEqual(['alice', 'bob']);
            expect(carol.seatsOpen()).toBe(false);
            expect(alice.canLoad()).toBe(false);
            expect(bob.canLoad()).toBe(true);
            // The second player is awaited, to load its bullets itself
            expect(carol.awaited()).toEqual([{ seat: TWO, own: true }]);
        });

        test('should load nothing for a participant who can not', async () => {
            // Given
            const [, , carol] = await table();

            // When
            carol.load(LOADS['alice']);
            await flush();

            // Then
            expect(carol.sending()).toBe(false);
            expect(messagesOf(CylinderMessageType.KEY)).toHaveLength(0);
        });

        test('should tell the seated players who left the room', async () => {
            // Given
            await table();

            // When
            hub.leave(rooms.get('bob') as Room<RoulettePayloads>);

            // Then
            expect(sessions[0].awayPlayers()).toEqual(['bob']);
        });
    });

    describe('a game', () => {
        test('should load and spin the cylinder, the player drawn playing first, then fire until every bullet fired', async () => {
            // Given
            const [alice, bob, carol] = await table();

            // When
            await loaded(alice, bob);

            // Then
            expect(new Set(sessions.map((session: RussianRouletteSession) => session.game().first())).size).toEqual(1);
            const first: RouletteSeat = carol.game().first() as RouletteSeat;
            expect(sessions[first].myTurn()).toBe(true);
            expect(carol.myTurn()).toBe(false);
            expect(carol.awaited()).toEqual([{ seat: first, own: true }]);

            // When
            while (!carol.over()) {
                await play('shoot');
            }

            // Then
            expect(carol.game().firedBullets()).toEqual(6);
            expect(sessions.map((session: RussianRouletteSession) => session.game().chambers())).toEqual([carol.game().chambers(), carol.game().chambers(), carol.game().chambers()]);
            await settled(sessions, (session: RussianRouletteSession) => session.played().verification() === CylinderVerification.FAIR);
            expect(carol.played().provisional()).toBe(false);
            expect(carol.played().result()).toEqual(carol.game().result());
            expect(carol.awaited()).toEqual([]);
            expect(carol.seatsOpen()).toBe(true);
            expect(hub.reports).toEqual([]);
        });

        test('should tell the result provisional until the cylinder is checked', async () => {
            // Given
            const [alice, bob, carol] = await table();

            // When the game ends, Bob not disclosing its key yet
            await overWithoutBobKey(alice, bob);

            // Then
            await settled([carol], (session: RussianRouletteSession) => session.awaited().length === 1);
            expect(carol.played().provisional()).toBe(true);
            expect(carol.awaited()).toEqual([{ seat: TWO, own: false }]);
            expect(carol.settled()).toBe(false);

            // When
            hub.release();

            // Then
            await settled([carol], (session: RussianRouletteSession) => !session.played().provisional());
            expect(carol.settled()).toBe(true);
        });

        test('should double the pass in a row, the bank taking the table on the 5th, which reveals the next chamber', async () => {
            // Given
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);

            // When
            for (let pass = 0; pass < 5; pass++) {
                await play('pass');
            }

            // Then
            await settled(sessions, (session: RussianRouletteSession) => session.game().chambers().length === 1);
            expect(carol.game().bank()).toEqual(31);
            expect(carol.game().deaths()).toEqual([0, 0]);
            expect(carol.game().toAct()).not.toBeNull();
            expect(carol.step()).toBeGreaterThan(5);
        });

        test('should keep the local player from acting again until its move is in the chain', async () => {
            // Given
            const [alice, bob] = await table();
            await loaded(alice, bob);
            const actor: RussianRouletteSession = sessions[alice.game().toAct() as RouletteSeat];
            hub.hold(actor === alice ? 'alice' : 'bob');

            // When
            actor.pass();

            // Then
            expect(actor.sending()).toBe(true);
            expect(actor.myTurn()).toBe(false);
            hub.release();
            await settled([actor], (session: RussianRouletteSession) => !session.sending());
        });

        test('should report a move out of the turn of its player, and ignore one of another step, another game or a spectator', async () => {
            // Given
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);
            const waiting: RussianRouletteSession = sessions[1 - (alice.game().toAct() as RouletteSeat)];
            const step: number = carol.step();

            // When
            waiting.shoot();
            rooms.get('alice')?.transmitMessage(RRGameSessionType.PASS, { game: 0, step: step - 1 });
            rooms.get('bob')?.transmitMessage(RRGameSessionType.PASS, { game: 1, step });
            carol.pass();
            rooms.get('carol')?.transmitMessage(CylinderMessageType.DISCLOSE, { game: 'other', secret: '1' });
            await flush();

            // Then
            await settled(sessions, (session: RussianRouletteSession) => session.step() === step);
            expect(hub.reported()).toEqual(['alice', 'bob', 'carol'].map((reporter: string) => `${ reporter } ${ CheatReason.ILLEGAL_MOVE } ${ waiting === alice ? 'alice' : 'bob' }`));
            expect(carol.game().actions()).toEqual([]);
        });
    });

    describe('timeout', () => {
        test('should end the game of the player to act on the timeout of the other one, its seat freed', async () => {
            // Given
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);
            const late: RouletteSeat = carol.game().toAct() as RouletteSeat;

            // When
            sessions[1 - late].claimTimeout();

            // Then
            await settled(sessions, (session: RussianRouletteSession) => session.game().forfeited() === late);
            expect(carol.played().result()?.winner).toEqual(1 - late);
            expect(carol.seats()[late]).toBeNull();
            await settled(sessions, (session: RussianRouletteSession) => session.played().verification() === CylinderVerification.FAIR);
        });

        test('should end the game of a player not loading its bullets', async () => {
            // Given
            const [alice, , carol] = await table();
            alice.load(LOADS['alice']);
            await settled(sessions, (session: RussianRouletteSession) => session.started());

            // When
            alice.claimTimeout();

            // Then
            await settled(sessions, (session: RussianRouletteSession) => session.game().forfeited() === TWO);
            // Nothing fired: nothing to check, nor to load
            expect(carol.played().verification()).toEqual(CylinderVerification.PENDING);
            expect(carol.played().provisional()).toBe(false);
            expect(carol.awaited()).toEqual([]);
            expect(carol.settled()).toBe(true);
            expect(sessions[1].canLoad()).toBe(false);

            // When the key of Bob comes late
            await (sessions[1].cylinder() as Cylinder).load(LOADS['bob']);
            await eventually(() => expect(messagesOf(CylinderMessageType.KEY, 'bob')).toHaveLength(1));
            await flush();

            // Then the cylinder of the game over loads nothing
            expect(carol.cylinder()?.phase()).toEqual(CylinderPhase.KEYS);
            expect(carol.settled()).toBe(true);
            await flush();
            expect(messagesOf(CylinderMessageType.LOAD)).toEqual([]);
        });

        test('should ignore a timeout once the move is made, of a player awaited too, of the player to act, or of a spectator', async () => {
            // Given
            const [alice, bob, carol] = await table();

            // When before the game
            alice.claimTimeout();
            await flush();

            // Then
            expect(carol.game().forfeited()).toBeNull();

            // Given
            await loaded(alice, bob);
            const actor: RussianRouletteSession = sessions[carol.game().toAct() as RouletteSeat];
            const other: RussianRouletteSession = actor === alice ? bob : alice;
            hub.hold('alice');
            hub.hold('bob');

            // When the move and the timeout cross
            actor.shoot();
            other.claimTimeout();
            hub.release();
            actor.claimTimeout();
            carol.claimTimeout();
            await settled(sessions, (session: RussianRouletteSession) => session.game().chambers().length === 1);

            // Then
            expect(carol.game().forfeited()).toBeNull();

            // When both shares are missing, the claim of one player is void
            hub.hold('alice');
            hub.hold('bob');
            sessions[carol.game().toAct() as RouletteSeat].shoot();
            hub.release();
            hub.hold('alice');
            hub.hold('bob');
            await settled([carol], (session: RussianRouletteSession) => session.game().shooting() !== null);
            expect(carol.awaited()).toEqual([{ seat: ONE, own: false }, { seat: TWO, own: false }]);
            rooms.get('alice')?.transmitMessage(RRGameSessionType.TIMEOUT, { game: 0, step: carol.step() });
            hub.held.splice(0).filter((message: AppMessage) => message.type === RRGameSessionType.TIMEOUT).forEach((message: AppMessage) => hub.send(message));
            await flush();

            // Then
            expect(carol.game().forfeited()).toBeNull();
            hub.release();
        });

        test('should give the game to the other player of a player withholding its key once the game is over', async () => {
            // Given a game over, Bob not disclosing his key
            const [alice, bob, carol] = await table();
            await overWithoutBobKey(alice, bob);

            // When his time is over
            await settled([alice], (session: RussianRouletteSession) => session.awaited().length === 1);
            alice.claimTimeout();

            // Then
            await settled([carol], (session: RussianRouletteSession) => session.played().withheld() === TWO);
            expect(carol.played().result()?.winner).toEqual(ONE);
            expect(carol.played().provisional()).toBe(false);
            expect(carol.awaited()).toEqual([]);
            expect(carol.seats()).toEqual(['alice', null]);
            hub.held.splice(0);
        });

        test('should wait for the key of a player who lost on time, its result provisional until checked', async () => {
            // Given
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);
            const late: RouletteSeat = carol.game().toAct() as RouletteSeat;
            hub.hold(late === ONE ? 'alice' : 'bob');

            // When
            sessions[1 - late].claimTimeout();

            // Then
            await settled([carol], (session: RussianRouletteSession) => session.game().forfeited() === late && session.awaited().length === 1);
            expect(carol.awaited()).toEqual([{ seat: late, own: false }]);
            expect(carol.played().provisional()).toBe(true);
            expect(carol.settled()).toBe(false);

            // When
            hub.release();

            // Then
            await settled([carol], (session: RussianRouletteSession) => session.settled());
            expect(carol.played().verification()).toEqual(CylinderVerification.FAIR);
            expect(carol.played().provisional()).toBe(false);
            expect(carol.played().result()?.winner).toEqual(1 - late);
        });

        test('should let the player who lost on time, its seat lost, claim the key the winner withholds', async () => {
            // Given a game lost on time, the winner not disclosing its key
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);
            const late: RouletteSeat = carol.game().toAct() as RouletteSeat;
            sessions[1 - late].claimTimeout();
            hub.hold(late === ONE ? 'bob' : 'alice');
            await settled([carol], (session: RussianRouletteSession) => session.game().forfeited() === late);
            await settled([sessions[late], carol], (session: RussianRouletteSession) => session.awaited().length === 1 && session.awaited()[0].seat === 1 - late);
            expect(sessions[late].mySeat()).toBeNull();
            expect(sessions[late].myPlayerSeat()).toEqual(late);

            // When
            sessions[late].claimTimeout();

            // Then
            await settled([carol], (session: RussianRouletteSession) => session.played().withheld() === 1 - late);
            expect(carol.played().result()?.winner).toEqual(late);
            expect(carol.settled()).toBe(true);
            expect(carol.seats()).toEqual([null, null]);
            hub.held.splice(0);
        });
    });

    describe('cheats', () => {
        test('should give the game to the other player of a player whose spin was cheated', async () => {
            // Given Bob turns the cylinder backwards
            const [alice, bob, carol] = await table({
                bob: (message: AppMessage) => message.type === CylinderMessageType.SPIN
                    ? { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [...(message.payload as CylinderSpinMessage).chambers].reverse() } }
                    : message,
            });
            await loaded(alice, bob);

            // When
            sessions[1 - (carol.game().toAct() as RouletteSeat)].claimTimeout();
            await settled(sessions, (session: RussianRouletteSession) => session.played().verification() === CylinderVerification.CHEATED);

            // Then
            expect(carol.played().result()?.winner).toEqual(ONE);
            expect(carol.played().provisional()).toBe(false);
            expect(hub.reported()).toContain(`carol ${ CheatReason.INVALID_SPIN } bob`);
        });

        test('should give no winner when both spins were cheated', async () => {
            // Given
            const reverse: Tamper = (message: AppMessage) => message.type === CylinderMessageType.SPIN
                ? { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [...(message.payload as CylinderSpinMessage).chambers].reverse() } }
                : message;
            const alice: RussianRouletteSession = page('alice', LIGHT, reverse);
            const bob: RussianRouletteSession = page('bob', LIGHT, reverse);
            const carol: RussianRouletteSession = page('carol');
            alice.takeSeat(ONE);
            bob.takeSeat(TWO);
            await settled(sessions, (session: RussianRouletteSession) => session.cylinder() !== null);
            await loaded(alice, bob);

            // When
            sessions[1 - (carol.game().toAct() as RouletteSeat)].claimTimeout();
            await settled(sessions, (session: RussianRouletteSession) => session.played().verification() === CylinderVerification.CHEATED);

            // Then
            expect(carol.played().result()?.winner).toBeNull();
        });

        test('should stop the game on a broken cylinder, its keys disclosed, its seats open', async () => {
            // Given
            const [alice, bob, carol] = await table({
                bob: (message: AppMessage) => message.type === CylinderMessageType.SPIN
                    ? { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [] } }
                    : message,
            });

            // When
            alice.load(LOADS['alice']);
            bob.load(LOADS['bob']);
            await settled(sessions, (session: RussianRouletteSession) => session.broken());

            // Then the spin names its player at once, then the check of the cylinder: the other player wins
            expect(carol.over()).toBe(true);
            expect(carol.played().result()?.winner).toEqual(ONE);
            expect(hub.reported()).toContain(`carol ${ CheatReason.INVALID_SPIN } bob`);
            await settled(sessions, (session: RussianRouletteSession) => session.played().verification() === CylinderVerification.CHEATED);
            expect(messagesOf(CylinderMessageType.DISCLOSE)).toHaveLength(2);
            expect(carol.played().result()).toEqual({ winner: ONE, deaths: [0, 0], stacks: [150, 150] });
            expect(carol.played().provisional()).toBe(false);
            expect(carol.seatsOpen()).toBe(true);

            // When the moves of the game are ignored, a new game may start
            alice.shoot();
            alice.rematch();
            await settled(sessions, (session: RussianRouletteSession) => session.pastGames().length === 1);

            // Then
            expect(carol.pastGames()[0].broken()).toBe(true);
            expect(carol.broken()).toBe(false);
        });
    });

    describe('new game', () => {
        /** A game over on time, Alice playing first or second */
        async function overOnTime(alice: RussianRouletteSession, bob: RussianRouletteSession): Promise<void> {
            await loaded(alice, bob);
            sessions[1 - (sessions[2].game().toAct() as RouletteSeat)].claimTimeout();
            await settled(sessions, (session: RussianRouletteSession) => session.over() && session.played().verification() === CylinderVerification.FAIR);
        }

        test('should start a new game on the first request of a seated player, with a cylinder of a new id', async () => {
            // Given
            const [alice, bob, carol] = await table();
            await overOnTime(alice, bob);
            const late: RouletteSeat = carol.game().forfeited() as RouletteSeat;
            sessions[late].takeSeat(late);
            await settled(sessions, (session: RussianRouletteSession) => !session.seats().includes(null));
            const former: Readonly<PlayedGame> = carol.played();

            // When
            alice.rematch();
            bob.rematch();
            await settled(sessions, (session: RussianRouletteSession) => session.pastGames().length === 1 && session.cylinder() !== null);

            // Then
            expect(carol.pastGames()).toEqual([former]);
            expect(carol.cylinder()?.id).toMatch(/:1$/);
            expect(carol.game().result()).toBeNull();
            expect(carol.step()).toEqual(0);
            expect(carol.seatsOpen()).toBe(true);
            expect(former.result()?.winner).toEqual(1 - late);
        });

        test('should keep the seats and the game until the keys of the game over are disclosed', async () => {
            // Given a game over, Bob not disclosing his key yet
            const [alice, bob, carol] = await table();
            await overWithoutBobKey(alice, bob);

            // When
            alice.rematch();
            alice.leaveSeat();
            await flush();

            // Then
            expect(carol.seatsOpen()).toBe(false);
            expect(carol.seats()).toEqual(['alice', 'bob']);
            expect(carol.pastGames()).toEqual([]);

            // When
            hub.release();
            await settled(sessions, (session: RussianRouletteSession) => session.settled());
            alice.rematch();

            // Then
            await settled(sessions, (session: RussianRouletteSession) => session.pastGames().length === 1);
        });

        test('should check the cylinder of a former game once its player, out of time, disclosed its key late', async () => {
            // Given a game lost on time, then the key of its late player withheld
            const [alice, bob, carol] = await table();
            await loaded(alice, bob);
            const late: RouletteSeat = carol.game().toAct() as RouletteSeat;
            const claimer: RussianRouletteSession = sessions[1 - late];
            hub.hold(late === ONE ? 'alice' : 'bob');
            claimer.claimTimeout();
            await settled([claimer, carol], (session: RussianRouletteSession) => session.game().forfeited() === late
                && session.awaited().length === 1 && session.awaited()[0].seat === late);
            claimer.claimTimeout();
            await settled([claimer, carol], (session: RussianRouletteSession) => session.settled());

            // When Carol takes the seat freed and starts a new game
            carol.takeSeat(late);
            await settled([claimer, carol], (session: RussianRouletteSession) => session.seats()[late] === 'carol');
            carol.rematch();
            await settled([claimer, carol], (session: RussianRouletteSession) => session.pastGames().length === 1);
            const former: Readonly<PlayedGame> = carol.pastGames()[0];
            expect(former.verification()).toEqual(CylinderVerification.PENDING);

            // When the late page discloses its key
            hub.release();

            // Then
            await settled([carol], () => former.verification() === CylinderVerification.FAIR);
            expect(former.result()?.winner).toEqual(1 - late);
            expect(carol.played().verification()).toEqual(CylinderVerification.PENDING);
        });

        test('should withhold the key of a player late once a broken cylinder stopped the game, the cheater losing', async () => {
            // Given a cylinder broken by the spin of Bob, his key refused: another one
            const [alice, bob, carol] = await table({
                bob: (message: AppMessage) => {
                    if (message.type === CylinderMessageType.SPIN) {
                        return { ...message, payload: { ...(message.payload as CylinderSpinMessage), chambers: [] } };
                    }
                    return message.type === CylinderMessageType.DISCLOSE ? { ...message, payload: { ...(message.payload as object), secret: '2' } } : message;
                },
            });
            alice.load(LOADS['alice']);
            bob.load(LOADS['bob']);
            await settled(sessions, (session: RussianRouletteSession) => session.broken());
            await settled([alice, carol], (session: RussianRouletteSession) => messagesOf(CylinderMessageType.DISCLOSE).length === 2 && session.awaited().length === 1);

            // When
            alice.claimTimeout();

            // Then Bob withheld his key, he does not lose on time
            await settled([carol], (session: RussianRouletteSession) => session.played().withheld() === TWO);
            expect(carol.game().forfeited()).toBeNull();
            expect(carol.played().result()?.winner).toEqual(ONE);
            expect(carol.settled()).toBe(true);
        });

        test('should not start a new game before the game is over, with a free seat, of a spectator or of another index', async () => {
            // Given
            const [alice, bob, carol] = await table();

            // When
            alice.rematch();
            await flush();

            // Then
            expect(carol.pastGames()).toEqual([]);

            // Given
            await overOnTime(alice, bob);

            // When
            carol.rematch();
            rooms.get('alice')?.transmitMessage(RRGameSessionType.REMATCH, { game: 2 });
            sessions[carol.game().forfeited() as RouletteSeat].rematch();
            await flush();

            // Then
            expect(carol.pastGames()).toEqual([]);
        });

        test('should free the seat of the other player away while the seats are open, not during a game, nor for a spectator', async () => {
            // Given
            const [alice, bob, carol] = await table();
            alice.load(LOADS['alice']);
            await settled(sessions, (session: RussianRouletteSession) => session.started());

            // When during the game
            alice.unseat(TWO);
            carol.unseat(TWO);
            await flush();

            // Then
            expect(carol.seats()).toEqual(['alice', 'bob']);

            // When the game is over
            alice.claimTimeout();
            await settled(sessions, (session: RussianRouletteSession) => session.over());
            carol.takeSeat(TWO);
            await settled(sessions, (session: RussianRouletteSession) => session.seats()[TWO] === 'carol');
            hub.leave(rooms.get('carol') as Room<RoulettePayloads>);
            alice.unseat(TWO);
            bob.unseat(ONE);

            // Then
            await settled([alice], (session: RussianRouletteSession) => session.seats()[TWO] === null);
            expect(alice.seats()[ONE]).toEqual('alice');
        });
    });

    test('should give back its place in the game to a player reloading the page', async () => {
        // Given
        const [alice, bob] = await table();
        await loaded(alice, bob);
        await play('shoot');

        // When Bob reloads
        bob.destroy();
        hub.close(rooms.get('bob') as Room<RoulettePayloads>);
        const reloaded: RussianRouletteSession = page('bob');
        sessions.splice(1, 1);
        sessions.splice(1, 0, sessions.pop() as RussianRouletteSession);
        hub.replay(rooms.get('bob') as Room<RoulettePayloads>);
        await settled([reloaded], (session: RussianRouletteSession) => session.game().chambers().length === 1);

        // Then
        expect(reloaded.mySeat()).toEqual(TWO);
        expect(reloaded.historySteps()).toEqual(2 * hub.delivered.length);
        await play('shoot');
        expect(reloaded.game().chambers()).toEqual(alice.game().chambers());
    });

    test('should play a lighter game with the rules given', async () => {
        // Given 6 chambers, a bullet each
        const rules: RouletteRules = { ...RUSSIAN_ROULETTE_RULES, chambers: 6, bullets: 1 };
        const alice: RussianRouletteSession = page('alice', rules);
        const bob: RussianRouletteSession = page('bob', rules);
        alice.takeSeat(ONE);
        bob.takeSeat(TWO);
        await settled(sessions, (session: RussianRouletteSession) => session.cylinder() !== null);

        // When
        alice.load([0]);
        bob.load([3]);
        await settled(sessions, (session: RussianRouletteSession) => session.game().toAct() !== null);

        // Then
        expect(alice.cylinder()?.phase()).toEqual(CylinderPhase.READY);
    });

    test('should stop receiving the messages once destroyed', async () => {
        // Given
        const alice: RussianRouletteSession = page('alice');

        // When
        alice.destroy();
        alice.takeSeat(ONE);
        await flush();

        // Then
        expect(alice.seats()).toEqual([null, null]);
    });
});
