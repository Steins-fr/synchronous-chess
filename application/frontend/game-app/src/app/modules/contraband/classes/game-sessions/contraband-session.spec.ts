import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { commitmentOf } from '@app/modules/commit-reveal/classes/commitment';
import { FairDraw } from '@app/modules/commit-reveal/classes/fair-draw';
import { SealedStore } from '@app/modules/commit-reveal/classes/sealed-store';
import { PrivateConversation } from '@app/modules/private-conversations/classes/private-conversation';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { BlockChainName } from '@app/services/room-manager/classes/room/block-room/block-chain-name.enum';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ContrabandEvent, ContrabandEventKind, ContrabandGameState, ContrabandPhase, WithheldReason } from '../rules/contraband-game-state';
import { Call, CallKind, CONTRABAND_RULES, ContrabandRules, ContrabandSetup, ContrabandVariant, Team } from '../rules/contraband-rules';
import { CustomsOutcome } from '../rules/customs';
import { drawSchedule } from '../rules/schedule';
import { CBGameSessionType, contrabandBlockChains, ContrabandPayloads } from './contraband-messages';
import { ContrabandSession } from './contraband-session';

/** Four games a match: the specs play one to its end quickly. The reveal keeps its time, beyond the watch of the censorship */
const LIGHT: ContrabandRules = { ...CONTRABAND_RULES, gameCounts: [4], defaultGames: 4 };
const NORTH: ReadonlyArray<string> = ['alice', 'bob'];
const SOUTH: ReadonlyArray<string> = ['carol', 'dave'];
const CLASSIC: ContrabandSetup = { variant: ContrabandVariant.CLASSIC, customsTime: 60, games: 4 };
const GOLD_RUSH: ContrabandSetup = { variant: ContrabandVariant.GOLD_RUSH, customsTime: 120, games: 4 };
const PASS: Call = { kind: CallKind.PASS };
const CHECK: Call = { kind: CallKind.CHECK };
const doubt = (amount: number): Call => ({ kind: CallKind.DOUBT, amount });
/** The time of the chain past any phase: a claim then counts */
const LATER: number = 1_000_000;
const COMMITMENT: string = 'c'.repeat(64);
const ROUND = { game: 0, attempt: 0 };

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing the messages of a type */
function tampering(type: CBGameSessionType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });
const settledGames = (session: ContrabandSession): number =>
    session.game()?.events().filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED).length ?? 0;
const trunks = (name: string): string | null => sessionStorage.getItem(`synchronous-chess:sealed-trunks:room:${ name }`);

describe('ContrabandSession', { timeout: 30_000 }, () => {
    let hub: RoomHub<ContrabandPayloads>;
    let rooms: Map<string, Room<ContrabandPayloads>>;
    let sessions: Map<string, ContrabandSession>;

    function page(name: string, tamper?: Tamper): ContrabandSession {
        const room: Room<ContrabandPayloads> = hub.room(name, tamper);
        const session = new ContrabandSession(room, { rules: LIGHT });
        rooms.set(name, room);
        sessions.set(name, session);
        return session;
    }

    const of = (name: string): ContrabandSession => sessions.get(name) as ContrabandSession;
    const gameOf = (name: string): ContrabandGameState => of(name).game() as ContrabandGameState;
    const lastEvent = (): Readonly<ContrabandEvent> | undefined => gameOf('eve').events().at(-1);
    const smuggler = (): string => of('eve').smuggler() as string;
    const inspector = (): string => of('eve').inspector() as string;

    /** Waits until every page passes the check */
    async function settled(check: (session: ContrabandSession) => boolean): Promise<void> {
        await eventually(() => sessions.forEach((session: ContrabandSession) => expect(check(session)).toBe(true)));
    }

    /** The players of the North seated on the first seats, the ones of the South on the seats of the South, Eve watching */
    async function seated(
        north: ReadonlyArray<string> = NORTH, south: ReadonlyArray<string> = SOUTH, tampers: Readonly<Record<string, Tamper>> = {},
    ): Promise<void> {
        [...north, ...south].forEach((name: string) => page(name, tampers[name]));
        page('eve');
        north.forEach((name: string, seat: number) => of(name).takeSeat(seat));
        south.forEach((name: string, seat: number) => of(name).takeSeat(LIGHT.teamSeats + seat));
        await settled((session: ContrabandSession) => session.players().length === north.length + south.length);
    }

    /** The players seated, the first one starts the match: every page draws the same pairings */
    async function started(
        setup: ContrabandSetup = CLASSIC, north: ReadonlyArray<string> = NORTH, south: ReadonlyArray<string> = SOUTH,
        tampers: Readonly<Record<string, Tamper>> = {},
    ): Promise<void> {
        await seated(north, south, tampers);
        of(north[0]).start(setup);
        await settled((session: ContrabandSession) => session.game() !== null);
    }

    /** The smuggler packs its trunk: the customs open on every page */
    async function packed(amount: number): Promise<void> {
        await of(smuggler()).pack(amount);
        await settled((session: ContrabandSession) => session.game()?.phase() === ContrabandPhase.CUSTOMS);
    }

    /** The smuggler packs its trunk, the inspector calls, then every page settles the game */
    async function crossed(amount: number, call: Call): Promise<void> {
        const before: number = settledGames(of('eve'));
        await packed(amount);
        of(inspector()).call(call);
        await settled((session: ContrabandSession) => settledGames(session) > before);
    }

    /** Every game of the match played, its trunks empty and passed */
    async function playedThrough(): Promise<void> {
        for (let crossing = 0; crossing < CLASSIC.games; crossing++) {
            await crossed(0, PASS);
        }
        await settled((session: ContrabandSession) => session.over());
    }

    function messagesOf(type: CBGameSessionType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    /** A claim of a timeout, at a time of the chain */
    function claim(name: string, at: number = LATER): void {
        hub.time = at;
        of(name).claimTimeout();
    }

    /** The player reloads the page: its new page catches up with the chain */
    function reloaded(name: string): ContrabandSession {
        of(name).destroy();
        hub.close(rooms.get(name) as Room<ContrabandPayloads>);
        const session: ContrabandSession = page(name);
        hub.replay(rooms.get(name) as Room<ContrabandPayloads>);
        return session;
    }

    /** The player leaves the room, its page closed */
    function left(name: string): void {
        hub.leave(rooms.get(name) as Room<ContrabandPayloads>);
        of(name).destroy();
        sessions.delete(name);
    }

    const ids = (session: ContrabandSession): ReadonlyArray<string> =>
        session.conversations().map((conversation: Readonly<PrivateConversation>) => conversation.id);

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<ContrabandPayloads>();
        rooms = new Map();
        sessions = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        sessions.forEach((session: ContrabandSession) => session.destroy());
        vi.restoreAllMocks();
    });

    test('should play the rules of the manga by default', () => {
        expect(new ContrabandSession(hub.room('zoe')).rules).toBe(CONTRABAND_RULES);
    });

    test('should route every message of the game to its chain', () => {
        expect(Object.keys(contrabandBlockChains)).toEqual(Object.values(CBGameSessionType));
        expect(new Set(Object.values(contrabandBlockChains))).toEqual(new Set([BlockChainName.CONTRABAND]));
    });

    describe('the start', () => {
        test('should let a seated player start once both countries hold as many players, every page drawing the same pairings', async () => {
            // Given
            ['alice', 'bob', 'carol', 'dave', 'eve'].forEach((name: string) => page(name));
            of('alice').takeSeat(0);
            await settled((session: ContrabandSession) => session.players().length === 1);

            // Then nobody starts, packs nor calls
            expect([of('alice').canStart(), of('alice').north(), of('alice').myTeam(), of('eve').myTeam()]).toEqual([false, 1, Team.NORTH, null]);
            expect([of('alice').canPack(), of('alice').canCall(), of('alice').myAtm(), of('alice').myTrunk(), of('eve').myAtm()]).toEqual([false, false, null, null, null]);
            expect([of('eve').smuggler(), of('eve').inspector(), of('eve').awaited(), of('eve').setup(), of('eve').conversations()]).toEqual([null, null, [], null, []]);
            of('alice').start(CLASSIC);
            await of('alice').pack(10);
            of('alice').call(PASS);
            expect(hub.delivered).toHaveLength(1);

            // When
            of('carol').takeSeat(4);
            await settled((session: ContrabandSession) => session.players().length === 2);

            // Then
            expect([of('alice').canStart(), of('carol').canStart(), of('eve').canStart(), of('carol').myTeam()]).toEqual([true, true, false, Team.SOUTH]);

            // When Bob sits in the North, then starts with the countries unequal
            of('bob').takeSeat(1);
            await settled((session: ContrabandSession) => session.players().length === 3);
            hub.send({ from: 'bob', type: CBGameSessionType.DRAW, payload: { ...ROUND, players: ['alice', 'bob', 'carol'], north: 2, ...CLASSIC } });

            // Then
            expect([of('alice').canStart(), of('alice').north(), of('alice').players()]).toEqual([false, 2, ['alice', 'bob', 'carol']]);
            of('dave').takeSeat(5);
            await settled((session: ContrabandSession) => session.players().length === 4);
            expect([of('alice').started(), of('alice').seatsOpen(), of('alice').inMatch(), of('alice').canStart()]).toEqual([false, true, false, true]);

            // When
            of('alice').start(CLASSIC);

            // Then the seats close at once, the players draw the seed
            await settled((session: ContrabandSession) => session.started());
            expect([of('bob').seatsOpen(), of('bob').inMatch(), of('eve').inMatch(), of('eve').setup()]).toEqual([false, true, false, CLASSIC]);
            await settled((session: ContrabandSession) => session.game() !== null);
            // The start, then the commitment and the part of each player
            expect(messagesOf(CBGameSessionType.DRAW)).toHaveLength(10);
            const game: ContrabandGameState = gameOf('eve');
            const seed: string = await (of('eve').played().draw as FairDraw).seed() as string;
            expect(game.schedule).toEqual(await drawSchedule(seed, 2, CLASSIC.games));
            sessions.forEach((session: ContrabandSession) => expect(session.game()?.schedule).toEqual(game.schedule));
            expect([game.north, game.setup, of('eve').played().north()]).toEqual([2, CLASSIC, 2]);
            // Alice smuggles first, across the customs of the South player drawn
            expect([of('eve').smuggler(), SOUTH.includes(inspector())]).toEqual(['alice', true]);
            expect([of('eve').step(), of('eve').awaited(), of('eve').phaseTime()]).toEqual([2, ['alice'], LIGHT.packingTime]);
            expect([of('alice').canPack(), of('bob').canPack(), of('eve').canPack(), of(inspector()).canCall()]).toEqual([true, false, false, false]);
            expect([of('alice').myAtm(), of('alice').myTrunk(), of('eve').myTrunk()]).toEqual([LIGHT.atm, null, null]);
            expect(hub.reports).toEqual([]);
            // Their parts in the chain, the pages keep them no more
            expect(sessionStorage.getItem('synchronous-chess:sealed-draws:room:alice')).toEqual('{}');
        });

        test('should send no start with a setup the rules do not offer, and report one', async () => {
            // Given
            await seated();

            // When
            of('alice').start({ ...CLASSIC, customsTime: 45 });
            of('alice').start({ ...CLASSIC, games: 10 });
            hub.send({
                from: 'bob', type: CBGameSessionType.DRAW,
                payload: { ...ROUND, players: [...NORTH, ...SOUTH], north: 2, ...CLASSIC, variant: 'smuggling' as ContrabandVariant },
            });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } bob`));
            expect(messagesOf(CBGameSessionType.DRAW)).toHaveLength(1);
            expect(of('eve').started()).toBe(false);
        });

        test('should ignore a start naming other players or countries than the seated ones, of a spectator, of another match, or once started', async () => {
            // Given
            await seated();
            const start = { ...ROUND, players: [...NORTH, ...SOUTH], north: 2, ...CLASSIC };

            // When
            hub.send({ from: 'alice', type: CBGameSessionType.DRAW, payload: { ...start, players: ['alice', 'bob', 'carol'] } });
            hub.send({ from: 'alice', type: CBGameSessionType.DRAW, payload: { ...start, north: 1 } });
            hub.send({ from: 'alice', type: CBGameSessionType.DRAW, payload: { ...ROUND, commitment: COMMITMENT } });
            hub.send({ from: 'eve', type: CBGameSessionType.DRAW, payload: start });
            hub.send({ from: 'alice', type: CBGameSessionType.DRAW, payload: { ...start, game: 1 } });
            of('alice').start(CLASSIC);
            hub.send({ from: 'bob', type: CBGameSessionType.DRAW, payload: { ...start, customsTime: 300 } });
            await settled((session: ContrabandSession) => session.game() !== null);
            hub.send({ from: 'bob', type: CBGameSessionType.DRAW, payload: { ...ROUND, commitment: COMMITMENT } });

            // Then
            expect(of('eve').players()).toEqual([...NORTH, ...SOUTH]);
            expect(of('eve').setup()).toEqual(CLASSIC);
            expect(hub.reports).toEqual([]);
        });

        test('should wait for the random parts of the players while drawing the seed', async () => {
            // Given
            await seated();
            hub.hold('dave');

            // When
            of('alice').start(CLASSIC);
            await settled((session: ContrabandSession) => session.awaited().length === 1);

            // Then
            expect([of('eve').awaited(), of('eve').extendingAway(), of('eve').step(), of('eve').phaseTime(), of('eve').smuggler()])
                .toEqual([['dave'], [], 0, LIGHT.drawTime, null]);
            expect([of('alice').myAtm(), of('alice').myTeam(), of('dave').myTeam()]).toEqual([null, Team.NORTH, Team.SOUTH]);
            // The conversations of the countries, from the start
            expect(ids(of('eve'))).toEqual(['cb-0-0-north', 'cb-0-0-south']);

            // When
            hub.release();

            // Then
            await settled((session: ContrabandSession) => session.game() !== null);
        });

        test('should wait for a random part its page lost, its storage blocked', async () => {
            // Given
            await seated();
            hub.hold('dave');
            of('alice').start(CLASSIC);
            await settled((session: ContrabandSession) => session.awaited().length === 1);
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
            await eventually(() => expect(messagesOf(CBGameSessionType.DRAW, 'dave')).toHaveLength(1));
            await settled((session: ContrabandSession) => session.awaited().join() === 'dave');
            expect(of('eve').game()).toBeNull();
        });

        test('should report a malformed commitment of the draw, and a random part not matching its commitment', async () => {
            // Given
            await seated(NORTH, SOUTH, {
                bob: tampering(CBGameSessionType.DRAW, (payload: { part?: string }) => payload.part === undefined ? payload : { ...payload, part: 'not mine' }),
            });

            // When
            of('alice').start(CLASSIC);
            hub.send({ from: 'carol', type: CBGameSessionType.DRAW, payload: { ...ROUND, commitment: 'malformed' } });
            await eventually(() => expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } bob`));

            // Then the draw waits for the part of Bob
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_MESSAGE } carol`);
            expect(of('eve').awaited()).toEqual(['bob']);
            expect(of('eve').game()).toBeNull();
        });

        test('should draw the same pairings on a page joining late, with the same games', async () => {
            // Given
            await started();
            await crossed(30, PASS);

            // When Zoe joins the room
            const late: ContrabandSession = page('zoe');
            hub.replay(rooms.get('zoe') as Room<ContrabandPayloads>);

            // Then
            await eventually(() => expect(late.game()?.events()).toEqual(gameOf('eve').events()));
            expect([late.game()?.schedule, late.smuggler(), late.conversations()]).toEqual([gameOf('eve').schedule, of('eve').smuggler(), of('eve').conversations()]);
        });
    });

    describe('a match', () => {
        test('should play every call of the classic variant, then settle the countries', async () => {
            // Given
            await started();
            expect(ids(of('eve'))).toEqual(['cb-0-0-north', 'cb-0-0-south']);

            // When Alice passes 40 million
            await crossed(40, PASS);
            // Then her South inspector smuggles an empty trunk, Alice doubting it
            expect(of('eve').smuggler()).toEqual(gameOf('eve').schedule[0].inspector === 2 ? 'carol' : 'dave');
            await crossed(0, doubt(10));
            // Bob packs 30 million, seized by a doubt of 30
            await crossed(30, doubt(30));
            // His South inspector packs 50 million, slipping past a doubt of 20
            await crossed(50, doubt(20));

            // Then
            await settled((session: ContrabandSession) => session.over());
            const settlements: ReadonlyArray<unknown> = gameOf('eve').events()
                .filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED)
                .map((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED && [event.contents, event.movement.outcome]);
            expect(settlements).toEqual([
                [40, CustomsOutcome.PASSED], [0, CustomsOutcome.EMPTY_DOUBT], [30, CustomsOutcome.SEIZED], [50, CustomsOutcome.SLIPPED],
            ]);
            // The North: 40 smuggled, 15 of indemnities paid, 550 left in the ATMs of the South, a debt of 600
            expect(of('eve').played().result()).toMatchObject({ winner: Team.SOUTH, totals: { [Team.NORTH]: -25, [Team.SOUTH]: 25 } });
            expect([of('alice').inMatch(), of('alice').seatsOpen(), of('alice').myTrunk(), of('eve').awaited()]).toEqual([false, true, null, []]);
            expect(of('eve').conversations().every((conversation: Readonly<PrivateConversation>) => !conversation.open)).toBe(true);
            expect(hub.reports).toEqual([]);
            [...NORTH, ...SOUTH].forEach((name: string) => expect(trunks(name)).toEqual('{}'));
        });

        test('should seal the trunk from every other page until the call, the inspector ordering the chain included', async () => {
            // Given
            await started();
            hub.sequencer.set(inspector());

            // When
            await packed(40);

            // Then only the page of Alice knows her trunk
            expect([of('alice').myTrunk(), of('alice').canPack(), of('alice').sending()]).toEqual([40, false, false]);
            ['bob', 'carol', 'dave', 'eve'].forEach((name: string) => expect([of(name).myTrunk(), trunks(name)]).toEqual([null, null]));
            expect(messagesOf(CBGameSessionType.COMMIT).map((message: AppMessage) => message.payload)).toEqual([
                { ...ROUND, crossing: 0, commitment: expect.stringMatching(/^[0-9a-f]{64}$/) },
            ]);
            expect(JSON.stringify(hub.delivered)).not.toContain('amount');
            expect([of('eve').awaited(), of('eve').phaseTime(), of(inspector()).canCall(), of('alice').canCall()])
                .toEqual([[inspector()], CLASSIC.customsTime, true, false]);
            // The customs open between Alice and her inspector
            expect(of('eve').conversations()).toContainEqual({
                id: 'cb-0-0-customs-0', members: ['alice', inspector()], open: true,
                title: { key: 'contraband.table.conversation.customs', params: { number: 1, smuggler: 'alice', inspector: inspector() } },
            });

            // When
            of(inspector()).call(PASS);

            // Then the page of Alice reveals her trunk once called, the customs closed
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            const types: string[] = hub.types();
            expect(types.indexOf(CBGameSessionType.REVEAL)).toBeGreaterThan(types.indexOf(CBGameSessionType.CALL));
            expect(of('eve').conversations().find((conversation: Readonly<PrivateConversation>) => conversation.id === 'cb-0-0-customs-0')?.open)
                .toBe(false);
            expect(of('eve').myAtm()).toBeNull();
            expect(gameOf('eve').atms()[0]).toEqual(LIGHT.atm - 40);
        });

        test('should declare the conversations of the countries of 2 players only, and the customs of each game packed', async () => {
            // Given
            await started(CLASSIC, ['alice'], ['carol']);

            // Then
            expect(of('eve').conversations()).toEqual([]);

            // When Alice packs nothing in time, then Carol packs
            claim('carol');
            await settled((session: ContrabandSession) => session.game()?.crossing() === 1);
            await packed(10);

            // Then
            expect(of('eve').conversations()).toEqual([{
                id: 'cb-0-0-customs-1', members: ['carol', 'alice'], open: true,
                title: { key: 'contraband.table.conversation.customs', params: { number: 2, smuggler: 'carol', inspector: 'alice' } },
            }]);
        });

        test('should name the countries in the titles of their conversations, every player a member of its own', async () => {
            // Given
            await started();

            // Then
            expect(of('eve').conversations()).toEqual([
                { id: 'cb-0-0-north', members: NORTH, title: { key: 'contraband.table.conversation.team', params: { team: Team.NORTH } }, open: true },
                { id: 'cb-0-0-south', members: SOUTH, title: { key: 'contraband.table.conversation.team', params: { team: Team.SOUTH } }, open: true },
            ]);
        });

        test('should play the Gold Rush with gold and iron bars, checked', async () => {
            // Given
            await started(GOLD_RUSH);

            // When Alice packs an amount of the classic variant
            await of('alice').pack(50);

            // Then
            expect(messagesOf(CBGameSessionType.COMMIT)).toEqual([]);

            // When Alice packs a gold bar, then her inspector doubts it, then checks it
            await packed(LIGHT.goldBar);
            of(inspector()).call(doubt(100));
            expect(messagesOf(CBGameSessionType.CALL)).toEqual([]);
            of(inspector()).call(CHECK);
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            // Then her inspector packs an iron bar, checked
            await crossed(0, CHECK);

            // Then
            expect(gameOf('eve').events().filter((event: Readonly<ContrabandEvent>) => event.kind === ContrabandEventKind.SETTLED))
                .toMatchObject([{ contents: 100, movement: { outcome: CustomsOutcome.SEIZED } }, { contents: 0, movement: { outcome: CustomsOutcome.IRON_CHECKED } }]);
            expect(hub.reports).toEqual([]);
        });

        test('should send no trunk the rules do not allow, nor a trunk of another player than the smuggler', async () => {
            // Given
            await started();

            // When
            await of('alice').pack(LIGHT.maxTrunk + 1);
            await of('alice').pack(2.5);
            await of('bob').pack(10);
            await of('eve').pack(10);

            // Then
            expect(messagesOf(CBGameSessionType.COMMIT)).toEqual([]);
        });
    });

    describe('the cheats', () => {
        test('should report a malformed commitment and a commitment of another player than the smuggler, and ignore the others', async () => {
            // Given
            await started();
            const commit = { ...ROUND, crossing: 0, commitment: COMMITMENT };

            // When
            hub.send({ from: 'alice', type: CBGameSessionType.COMMIT, payload: { ...commit, commitment: 'malformed' } });
            hub.send({ from: inspector(), type: CBGameSessionType.COMMIT, payload: commit });
            [{ crossing: 1 }, { game: 1 }, { attempt: 1 }].forEach((change: object) =>
                hub.send({ from: 'alice', type: CBGameSessionType.COMMIT, payload: { ...commit, ...change } }));
            hub.send({ from: 'eve', type: CBGameSessionType.COMMIT, payload: commit });
            await packed(20);
            hub.send({ from: 'alice', type: CBGameSessionType.COMMIT, payload: commit });

            // Then
            await eventually(() => expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([
                `eve ${ CheatReason.INVALID_MESSAGE } alice`, `eve ${ CheatReason.ILLEGAL_MOVE } ${ inspector() }`,
            ]));
            expect([gameOf('eve').phase(), gameOf('eve').events().length, of('alice').myTrunk()]).toEqual([ContrabandPhase.CUSTOMS, 1, 20]);
        });

        test('should report a call the variant does not offer, the inspector still awaited, and a call of another player', async () => {
            // Given
            await started();
            const call = { ...ROUND, crossing: 0, call: PASS };
            hub.send({ from: inspector(), type: CBGameSessionType.CALL, payload: call });
            await packed(20);

            // When
            of(inspector()).call(doubt(LIGHT.maxDoubt + 1));
            of(inspector()).call(CHECK);
            hub.send({ from: 'alice', type: CBGameSessionType.CALL, payload: call });
            hub.send({ from: inspector(), type: CBGameSessionType.CALL, payload: { ...call, call: doubt(0) } });
            hub.send({ from: inspector(), type: CBGameSessionType.CALL, payload: { ...call, call: CHECK } });
            hub.send({ from: inspector(), type: CBGameSessionType.CALL, payload: { ...call, crossing: 1 } });
            hub.send({ from: 'eve', type: CBGameSessionType.CALL, payload: call });

            // Then
            await eventually(() => expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([
                `eve ${ CheatReason.ILLEGAL_MOVE } alice`, `eve ${ CheatReason.INVALID_MESSAGE } ${ inspector() }`,
                `eve ${ CheatReason.INVALID_MESSAGE } ${ inspector() }`,
            ]));
            expect(messagesOf(CBGameSessionType.CALL, inspector())).toHaveLength(4);
            expect([gameOf('eve').phase(), of('eve').awaited()]).toEqual([ContrabandPhase.CUSTOMS, [inspector()]]);
        });

        test.each([
            { name: 'otherwise than packed', change: (payload: { amount: number }) => ({ ...payload, amount: payload.amount + 1 }) },
            { name: 'without its salt', change: (payload: object) => ({ ...payload, salt: undefined }) },
            { name: 'with an amount of no number', change: (payload: { amount: number }) => ({ ...payload, amount: String(payload.amount) }) },
        ])('should report a trunk revealed $name, seized at the most it could hold', async ({ change }) => {
            // Given
            await started(CLASSIC, NORTH, SOUTH, { alice: tampering(CBGameSessionType.REVEAL, change) });

            // When
            await crossed(40, PASS);

            // Then
            expect(hub.reported()).toContain(`eve ${ CheatReason.INVALID_REVEAL } alice`);
            expect(lastEvent()).toMatchObject({
                kind: ContrabandEventKind.SETTLED, contents: null, reason: WithheldReason.INVALID, movement: { outcome: CustomsOutcome.WITHHELD, seized: LIGHT.maxTrunk },
            });
            // Refused, the trunk of Alice leaves her tab
            expect(trunks('alice')).toEqual('{}');
        });

        test('should report a trunk the rules do not allow, matching its commitment, and ignore a reveal not awaited', async () => {
            // Given
            await started();
            const id: string = of('eve').played().id();
            const reveal = { ...ROUND, crossing: 0, amount: 150, salt: 'salt' };
            hub.send({ from: 'alice', type: CBGameSessionType.COMMIT, payload: { ...ROUND, crossing: 0, commitment: await commitmentOf([id, 'trunk', 0, 0, 150, 'salt'], ':') } });
            await settled((session: ContrabandSession) => session.game()?.phase() === ContrabandPhase.CUSTOMS);
            hub.send({ from: 'alice', type: CBGameSessionType.REVEAL, payload: reveal });

            // When
            of(inspector()).call(PASS);
            await settled((session: ContrabandSession) => session.game()?.phase() === ContrabandPhase.REVEALING);
            hub.send({ from: 'bob', type: CBGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: 'eve', type: CBGameSessionType.REVEAL, payload: reveal });
            hub.send({ from: 'alice', type: CBGameSessionType.REVEAL, payload: { ...reveal, crossing: 1 } });
            hub.send({ from: 'alice', type: CBGameSessionType.REVEAL, payload: reveal });

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect(hub.reported().filter((report: string) => report.startsWith('eve '))).toEqual([`eve ${ CheatReason.ILLEGAL_MOVE } alice`]);
            expect(lastEvent()).toMatchObject({ contents: null, reason: WithheldReason.ILLEGAL, movement: { seized: LIGHT.maxTrunk } });
        });
    });

    describe('the timeouts', () => {
        test('should seize a trunk not revealed once the time of the reveal is over', async () => {
            // Given the reveal of Alice never counts
            await started(CLASSIC, NORTH, SOUTH, { alice: tampering(CBGameSessionType.REVEAL, (payload: object) => ({ ...payload, game: 9 })) });
            await packed(40);
            of(inspector()).call(PASS);
            await eventually(() => expect(messagesOf(CBGameSessionType.REVEAL)).toHaveLength(1));
            expect([of('alice').myTrunk(), of('eve').phaseTime()]).toEqual([40, LIGHT.revealTime]);

            // When
            claim(inspector());

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ contents: null, reason: WithheldReason.LATE, movement: { seized: LIGHT.maxTrunk } });
            expect(gameOf('eve').absent()).toEqual([0]);
            // Withheld, the trunk of Alice leaves her tab
            expect(trunks('alice')).toEqual('{}');
        });

        test('should move nothing once the smuggler does not pack, pass once the inspector does not call, and give no more time to a player absent', async () => {
            // Given Alice away
            await started();
            left('alice');
            await settled((session: ContrabandSession) => session.awaitedAway().join() === 'alice');
            expect(of('eve').extendingAway()).toEqual(['alice']);

            // When the packing times out
            claim('bob');

            // Then
            await settled((session: ContrabandSession) => session.game()?.crossing() === 1);
            expect(gameOf('eve').events()).toMatchObject([{ kind: ContrabandEventKind.PACK_LATE, crossing: 0, smuggler: 0 }]);
            expect([gameOf('eve').absent(), of('eve').inspector()]).toEqual([[0], 'alice']);

            // When her South inspector packs, then the customs time out
            await packed(10);
            expect([of('eve').awaitedAway(), of('eve').extendingAway()]).toEqual([['alice'], []]);
            claim('carol', 2 * LATER);

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect(gameOf('eve').events()).toContainEqual(expect.objectContaining({ kind: ContrabandEventKind.CALLED, call: PASS, late: true }));
            expect(lastEvent()).toMatchObject({ contents: 10, movement: { outcome: CustomsOutcome.PASSED } });
        });

        test('should void a claim coming before the time of the packing, its claimer waiting again', async () => {
            // Given
            hub.time = 1_000;
            await started();

            // When
            claim('bob', 1_000 + (LIGHT.packingTime - 3) * 1000);
            await settled((session: ContrabandSession) => !session.sending());

            // Then
            expect([of('bob').voidedClaims(), of('alice').voidedClaims()]).toEqual([1, 0]);
            expect(gameOf('eve').phase()).toEqual(ContrabandPhase.PACKING);

            // When
            claim('bob', 1_000 + (LIGHT.packingTime - 2) * 1000);

            // Then
            await settled((session: ContrabandSession) => session.game()?.crossing() === 1);
            expect(lastEvent()).toMatchObject({ kind: ContrabandEventKind.PACK_LATE });
        });

        test('should take a claim at once in a room without time', async () => {
            // Given
            await seated();
            rooms.forEach((room: Room<ContrabandPayloads>) => vi.spyOn(room, 'sequencedAt').mockReturnValue(undefined));
            hub.hold('dave');
            of('alice').start(CLASSIC);
            await settled((session: ContrabandSession) => session.awaited().length === 1);

            // When
            claim('alice', 0);

            // Then
            await settled((session: ContrabandSession) => !session.started());
        });

        test('should ignore a claim of a step past, of a spectator, of another match, once the match is over, and a rematch before', async () => {
            // Given
            await seated();
            claim('alice');
            await started();
            const step: number = of('eve').step();
            await packed(10);

            // When
            hub.time = LATER;
            hub.send({ from: 'alice', type: CBGameSessionType.TIMEOUT, payload: { ...ROUND, step } });
            hub.send({ from: 'eve', type: CBGameSessionType.TIMEOUT, payload: { ...ROUND, step: of('eve').step() } });
            hub.send({ from: 'alice', type: CBGameSessionType.TIMEOUT, payload: { ...ROUND, game: 1, step: of('eve').step() } });
            of('bob').rematch();
            of(inspector()).call(PASS);

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect([gameOf('eve').events().length, of('eve').pastGames()]).toEqual([3, []]);

            // When the match is over
            for (let crossing = 1; crossing < CLASSIC.games; crossing++) {
                await crossed(0, PASS);
            }
            await settled((session: ContrabandSession) => session.over());
            claim('dave');

            // Then
            await settled((session: ContrabandSession) => !session.sending());
            expect(gameOf('eve').events()).toHaveLength(3 * CLASSIC.games);
        });

        test('should start the match again once the draw times out, the seats of its late players freed', async () => {
            // Given
            hub.time = 0;
            await seated();
            hub.hold('dave');
            of('alice').start(CLASSIC);
            await settled((session: ContrabandSession) => session.awaited().length === 1);

            // When
            claim('alice', LIGHT.drawTime * 1000);

            // Then the countries are unequal
            await settled((session: ContrabandSession) => !session.started());
            expect(of('eve').tableSeats.seats()).toEqual(['alice', 'bob', null, null, 'carol', null, null, null]);
            expect([of('eve').played().attempt, of('eve').setup(), of('alice').canStart(), of('eve').conversations()]).toEqual([1, null, false, []]);
            // The draw over, the part of Alice leaves her tab
            expect(sessionStorage.getItem('synchronous-chess:sealed-draws:room:alice')).toEqual('{}');

            // When the late part comes, Dave sits again, then the match starts again
            hub.release();
            of('dave').takeSeat(7);
            await settled((session: ContrabandSession) => session.players().length === 4);
            of('bob').start(GOLD_RUSH);

            // Then
            await settled((session: ContrabandSession) => session.game() !== null);
            expect([of('alice').players(), of('alice').setup(), ids(of('dave'))]).toEqual([[...NORTH, ...SOUTH], GOLD_RUSH, ['cb-0-1-north', 'cb-0-1-south']]);
        });
    });

    describe('a reload', () => {
        test('should let the smuggler pack once it reloads the page while packing', async () => {
            // Given
            await started();

            // When
            const again: ContrabandSession = reloaded('alice');
            const caughtUp = vi.fn();
            again.caughtUp.subscribe(caughtUp);
            await eventually(() => expect(again.canPack()).toBe(true));
            await crossed(20, PASS);

            // Then
            expect(lastEvent()).toMatchObject({ contents: 20, movement: { outcome: CustomsOutcome.PASSED } });
            expect(caughtUp).toHaveBeenCalledOnce();
        });

        test('should keep the trunk sealed by a smuggler who reloads the page during the customs, and reveal it, the inspector calling after a reload', async () => {
            // Given
            await started();
            await packed(40);

            // When
            const smugglerPage: ContrabandSession = reloaded('alice');
            const inspectorPage: ContrabandSession = reloaded(inspector());
            await eventually(() => expect([smugglerPage.myTrunk(), inspectorPage.canCall()]).toEqual([40, true]));

            // Then
            expect([smugglerPage.canPack(), inspectorPage.myTrunk()]).toEqual([false, null]);

            // When
            inspectorPage.call(doubt(50));

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ contents: 40, movement: { outcome: CustomsOutcome.SEIZED, seized: 40 } });
            expect(hub.reports).toEqual([]);
        });

        test('should reveal the trunk again once the smuggler reloads the page while revealing, the first reveal counting', async () => {
            // Given
            await started();
            await packed(40);
            hub.hold('alice');
            of(inspector()).call(PASS);
            await eventually(() => expect(hub.held).toHaveLength(1));

            // When
            const again: ContrabandSession = reloaded('alice');
            await eventually(() => expect(hub.held).toHaveLength(2));
            hub.release();

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect([lastEvent(), again.myTrunk()]).toMatchObject([{ contents: 40, movement: { outcome: CustomsOutcome.PASSED } }, null]);
            expect(hub.reports).toEqual([]);
        });

        test('should reveal the trunk of the first commitment of the smuggler, a second one sealed meanwhile ignored', async () => {
            // Given
            await started();
            hub.hold('alice');
            await of('alice').pack(10);

            // When Alice reloads the page before her commitment is in the chain, and packs again
            const again: ContrabandSession = reloaded('alice');
            await eventually(() => expect(again.canPack()).toBe(true));
            await again.pack(20);
            hub.release();
            await settled((session: ContrabandSession) => session.game()?.phase() === ContrabandPhase.CUSTOMS);
            of(inspector()).call(doubt(15));

            // Then
            await settled((session: ContrabandSession) => settledGames(session) === 1);
            expect(lastEvent()).toMatchObject({ contents: 10, movement: { outcome: CustomsOutcome.SEIZED } });
            expect(hub.reports).toEqual([]);
            expect(trunks('alice')).toEqual('{}');
        });

        test('should keep the seal of a commitment of the local player taken, delivered again', async () => {
            // Given
            await started();
            await packed(40);
            const sealed: string | null = trunks('alice');

            // When
            hub.replay(rooms.get('alice') as Room<ContrabandPayloads>, messagesOf(CBGameSessionType.COMMIT, 'alice'));
            await new Promise((resolve) => setTimeout(resolve));

            // Then
            expect(sealed).not.toEqual('{}');
            expect(trunks('alice')).toEqual(sealed);
        });

        test('should commit again to the random part of the draw it stored, its page reloaded before its commitment came back', async () => {
            // Given
            await seated();
            hub.hold('dave');
            of('alice').start(CLASSIC);
            await settled((session: ContrabandSession) => session.awaited().length === 1);

            // When Dave reloads the page, his commitment still waiting for the chain
            const again: ContrabandSession = reloaded('dave');
            await eventually(() => expect(hub.held).toHaveLength(2));
            hub.release();

            // Then both commitments are the same: the part revealed matches the first one
            await settled((session: ContrabandSession) => session.game() !== null);
            const [first, second] = messagesOf(CBGameSessionType.DRAW, 'dave');
            expect(first.payload).toEqual(second.payload);
            expect(again.game()).not.toBeNull();
            expect(hub.reports).toEqual([]);
        });
    });

    describe('a new match', () => {
        test('should play a new match once the former one is over, a player changing of country, with its own conversations', async () => {
            // Given
            await started();
            await playedThrough();

            // When
            of('eve').rematch();
            of('bob').rematch();
            of('carol').rematch();

            // Then
            await settled((session: ContrabandSession) => session.pastGames().length === 1);
            expect([of('eve').started(), of('eve').played().index, of('eve').pastGames()[0].result()?.winner]).toEqual([false, 1, null]);
            expect([of('alice').canStart(), of('alice').myTrunk(), of('eve').setup(), of('eve').conversations()]).toEqual([true, null, null, []]);

            // When Alice moves to the South, Carol to the North
            of('alice').leaveSeat();
            of('carol').leaveSeat();
            await settled((session: ContrabandSession) => session.players().length === 2);
            of('alice').takeSeat(6);
            of('carol').takeSeat(2);
            await settled((session: ContrabandSession) => session.players().length === 4);
            of('dave').start(GOLD_RUSH);
            await settled((session: ContrabandSession) => session.game() !== null);

            // Then
            expect([of('eve').players(), of('alice').myTeam(), gameOf('eve').variant]).toEqual([['bob', 'carol', 'dave', 'alice'], Team.SOUTH, ContrabandVariant.GOLD_RUSH]);
            expect(of('eve').conversations().map(({ id, members }: Readonly<PrivateConversation>) => [id, members])).toEqual([
                ['cb-1-0-north', ['bob', 'carol']], ['cb-1-0-south', ['dave', 'alice']],
            ]);
            await crossed(LIGHT.goldBar, PASS);
            expect(lastEvent()).toMatchObject({ smuggler: 0, movement: { outcome: CustomsOutcome.PASSED, smuggled: LIGHT.goldBar } });
            expect(hub.reports).toEqual([]);
        });

        test('should clear the seals left once the match is over, a page reloaded in the next match keeping its trunk', async () => {
            // Given the seal of a commitment of Alice lost on its way
            new SealedStore<unknown>('trunks', 'room', 'alice').save('lost', { crossing: 0, amount: 10, salt: 'salt' });
            await started();

            // When
            await playedThrough();

            // Then
            await eventually(() => expect(trunks('alice')).toEqual('{}'));
            const firstMatch: number = hub.delivered.length;

            // When Alice packs in the next match, then reloads the page, its history caught up in two parts: the first match over
            ['eve', 'bob', 'carol'].forEach((name: string) => of(name).rematch());
            await settled((session: ContrabandSession) => session.pastGames().length === 1);
            of('dave').start(CLASSIC);
            await settled((session: ContrabandSession) => session.game() !== null);
            await packed(30);
            of('alice').destroy();
            hub.close(rooms.get('alice') as Room<ContrabandPayloads>);
            const again: ContrabandSession = page('alice');
            hub.replay(rooms.get('alice') as Room<ContrabandPayloads>, hub.delivered.slice(0, firstMatch));
            await eventually(() => expect(again.over()).toBe(true));
            hub.replay(rooms.get('alice') as Room<ContrabandPayloads>, hub.delivered.slice(firstMatch));

            // Then
            await eventually(() => expect([again.played().index, again.myTrunk()]).toEqual([1, 30]));
        });

        test('should clear the seals left of a match over in the history of a page reloaded once a new match starts', async () => {
            // Given Alice reloading the page once the match is over, a seal of hers left
            await started();
            await playedThrough();
            const again: ContrabandSession = reloaded('alice');
            await eventually(() => expect(again.over()).toBe(true));
            new SealedStore<unknown>('trunks', 'room', 'alice').save('lost', { crossing: 0, amount: 10, salt: 'salt' });

            // When
            ['eve', 'bob', 'carol'].forEach((name: string) => of(name).rematch());

            // Then
            await settled((session: ContrabandSession) => session.pastGames().length === 1);
            expect(trunks('alice')).toEqual('{}');
        });
    });

    test('should free the seat of a player away, before the match starts', async () => {
        // Given
        await seated();
        left('dave');

        // When
        of('alice').unseat(5);

        // Then
        await settled((session: ContrabandSession) => session.players().length === 3);
        of('alice').leaveSeat();
        await eventually(() => expect(of('eve').players()).toEqual(['bob', 'carol']));
    });
});
