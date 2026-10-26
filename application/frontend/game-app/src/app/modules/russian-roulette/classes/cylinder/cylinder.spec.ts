import { TimedLogger } from '@app/helpers/timed-logger.helper';
import { ExponentialElGamal } from '@app/modules/mental-poker/classes/exponential-elgamal';
import { CheatReason } from '@app/services/room-manager/classes/room/block-room/anti-cheat/cheat-report';
import { Room } from '@app/services/room-manager/classes/room/room';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { RoomHub } from '@testing/room-hub';
import { SecretStore } from '@app/modules/mental-poker/classes/secret-store';
import { TEST_GROUP } from '@testing/sra-test-group';
import { merge } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { Cylinder, CylinderOptions, CylinderSecrets, CylinderVerification } from './cylinder';
import { CylinderLoadMessage, CylinderMessage, CylinderMessageType, CylinderPayloads, CylinderShareMessage, CylinderSpinMessage } from './cylinder-messages';
import { CylinderPhase, CylinderState } from './cylinder-state';

const ID: string = 'salt1:salt2:0';
const cipher = new ExponentialElGamal(TEST_GROUP);
/** The chambers of the cylinders of the specs: fewer than in a game, for the specs to run fast */
const CHAMBERS: number = 12;
/** The chambers each player loads: no rotation of one gives the other, nor a reversed spin their sum */
const LOADS: Readonly<Record<string, ReadonlyArray<number>>> = { a: [0, 1, 3], b: [6, 8, 11] };

type Tamper = (message: AppMessage) => AppMessage;

/** A cheating client changing a message of a type */
function tampering(type: CylinderMessageType, change: (payload: never) => unknown): Tamper {
    return (message: AppMessage) => message.type === type ? { ...message, payload: change(message.payload as never) } : message;
}

/** The page of a participant: its cylinder applies the messages one after the other, as the session does */
interface Page {
    readonly name: string;
    readonly room: Room<CylinderPayloads>;
    readonly cylinder: Cylinder;
    /** The bullets of each chamber fired */
    readonly fired: Map<number, number>;
}

/** Waits for a check: loading the bullets checks their proofs, slower when the specs run in parallel */
const eventually = <T>(check: () => T | Promise<T>): Promise<T> => vi.waitFor(check, { timeout: 10_000 });

// A cylinder loads and spins, its proofs checked: slower when the specs run in parallel
describe('Cylinder', { timeout: 30_000 }, () => {
    let hub: RoomHub<CylinderPayloads>;
    let pages: Map<string, Page>;

    function page(name: string, tamper?: Tamper, options: Partial<CylinderOptions> = {}): Page {
        const room: Room<CylinderPayloads> = hub.room(name, tamper);
        const cylinder = new Cylinder(room, { id: ID, players: ['a', 'b'], cipher, chambers: CHAMBERS, ...options });
        const fired = new Map<number, number>();
        let queue: Promise<void> = Promise.resolve();
        let pending: number = 0;

        merge(...Object.values(CylinderMessageType).map((type: CylinderMessageType) => room.messenger(type))).subscribe((message: AppMessage) => {
            pending++;
            queue = queue.then(async () => {
                const applied = await cylinder.apply(message as CylinderMessage);
                if (applied.fired) {
                    fired.set(applied.fired.chamber, applied.fired.bullets);
                }
                if (--pending === 0) {
                    void cylinder.act();
                }
            });
        });

        const created: Page = { name, room, cylinder, fired };
        pages.set(name, created);
        return created;
    }

    /** The players a and b, and the spectator c */
    function table(tampers: { a?: Tamper; b?: Tamper } = {}): [Page, Page, Page] {
        return [page('a', tampers.a), page('b', tampers.b), page('c')];
    }

    /** The page of a participant loaded again: a new cylinder, the chain replayed to it */
    function reload(name: string, store?: SecretStore<CylinderSecrets>): Page {
        const former: Page = pages.get(name) as Page;
        former.cylinder.destroy();
        hub.close(former.room);
        const reloaded: Page = page(name, undefined, store ? { store } : {});
        hub.replay(reloaded.room);
        return reloaded;
    }

    async function loaded(...players: Page[]): Promise<void> {
        await Promise.all(players.map(({ name, cylinder }) => cylinder.load(LOADS[name])));
    }

    async function ready(): Promise<void> {
        await eventually(() => pages.forEach(({ cylinder }) => expect(cylinder.phase()).toEqual(CylinderPhase.READY)));
    }

    /** Asks every page, as a message of the game does, then acts as the session does once the message applied */
    function ask(request: (cylinder: Cylinder) => void, of: ReadonlyArray<Page> = [...pages.values()]): void {
        of.forEach(({ cylinder }) => {
            request(cylinder);
            void cylinder.act();
        });
    }

    /** Fires a chamber on every page, as the game does when the shot applies */
    async function fire(chamber: number): Promise<ReadonlyArray<number | undefined>> {
        ask((cylinder: Cylinder) => cylinder.requestShot(chamber));
        await eventually(() => pages.forEach(({ fired }) => expect(fired.has(chamber)).toBe(true)));
        return [...pages.values()].map(({ fired }) => fired.get(chamber));
    }

    async function disclose(): Promise<void> {
        ask((cylinder: Cylinder) => cylinder.requestDisclosure());
        await eventually(() => pages.forEach(({ cylinder }) => expect([CylinderVerification.FAIR, CylinderVerification.CHEATED]).toContain(cylinder.verification())));
    }

    function messagesOf(type: CylinderMessageType, from?: string): AppMessage[] {
        return hub.delivered.filter((message: AppMessage) => message.type === type && (from === undefined || message.from === from));
    }

    beforeEach(() => {
        sessionStorage.clear();
        hub = new RoomHub<CylinderPayloads>();
        pages = new Map();
        vi.spyOn(TimedLogger, 'warn').mockImplementation(() => undefined);
        vi.spyOn(TimedLogger, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        pages.forEach(({ cylinder }) => cylinder.destroy());
        vi.restoreAllMocks();
    });

    test('should need 2 players', () => {
        expect(() => new CylinderState(ID, ['a', 'a'], cipher)).toThrow('A cylinder needs 2 players');
    });

    test('should be loaded by both players, then spun by each in turn, the same first shooter drawn for everyone', async () => {
        // Given
        const [a, b, c] = table();

        // Then the cylinder waits for the keys
        expect(c.cylinder.phase()).toEqual(CylinderPhase.KEYS);
        expect(c.cylinder.waitingFor()).toEqual(['a', 'b']);
        expect(c.cylinder.players).toEqual(['a', 'b']);

        // When
        await a.cylinder.load(LOADS['a']);

        // Then
        expect(a.cylinder.keyGiven).toBe(true);
        expect(a.cylinder.bullets()).toEqual(LOADS['a']);
        await eventually(() => expect(c.cylinder.waitingFor()).toEqual(['b']));

        // When
        await loaded(b);
        await ready();

        // Then
        expect(hub.types()).toEqual([
            CylinderMessageType.KEY, CylinderMessageType.KEY, CylinderMessageType.LOAD, CylinderMessageType.LOAD, CylinderMessageType.SPIN, CylinderMessageType.SPIN,
        ]);
        expect(messagesOf(CylinderMessageType.SPIN).map((message: AppMessage) => message.from)).toEqual(['a', 'b']);
        expect(new Set([a, b, c].map(({ cylinder }) => cylinder.first())).size).toEqual(1);
        expect([0, 1]).toContain(c.cylinder.first());
        expect(c.cylinder.waitingFor()).toEqual([]);
        expect(c.cylinder.bullets()).toEqual([]);
        expect(hub.reports).toEqual([]);
    });

    test('should fire every chamber as loaded and turned, then be checked fair once both keys are disclosed', async () => {
        // Given
        const [a, b, c] = table();
        await loaded(a, b);
        await ready();

        // When
        const chambers: number[] = [];
        for (let chamber = 0; chamber < CHAMBERS; chamber++) {
            const bullets: ReadonlyArray<number | undefined> = await fire(chamber);
            expect(new Set(bullets).size).toEqual(1);
            chambers.push(bullets[0] as number);
        }

        // Then the bullets of each player keep their spacing, turned by an offset no one chose alone
        const pattern: number[] = Array.from({ length: CHAMBERS }, (_, index: number) => LOADS['a'].includes(index) || LOADS['b'].includes(index) ? 1 : 0);
        const offsets: number[] = pattern.map((_, offset: number) => offset)
            .filter((offset: number) => chambers.every((bullets: number, index: number) => bullets === pattern[(index + offset) % CHAMBERS]));
        expect(offsets).toHaveLength(1);
        expect(c.cylinder.waitingFor()).toEqual([]);

        // When
        await disclose();

        // Then
        [a, b, c].forEach(({ cylinder }) => expect(cylinder.verification()).toEqual(CylinderVerification.FAIR));
        expect(c.cylinder.cheaters()).toEqual([]);
        expect(new SecretStore<CylinderSecrets>('cylinder', 'room', 'a').get(ID)).toBeUndefined();
        expect(hub.reports).toEqual([]);
    });

    test('should count both bullets of a chamber loaded by both players', async () => {
        // Given every chamber of b but one loaded by a too
        const [a, b] = table();
        await a.cylinder.load([0, 1, 2]);
        await b.cylinder.load([0, 1, 5]);
        await ready();

        // When
        const chambers: number[] = [];
        for (let chamber = 0; chamber < CHAMBERS; chamber++) {
            chambers.push((await fire(chamber))[0] as number);
        }

        // Then
        expect(chambers.filter((bullets: number) => bullets === 2)).toHaveLength(2);
        expect(chambers.reduce((sum: number, bullets: number) => sum + bullets, 0)).toEqual(6);
    });

    test('should give the shares of a chamber fired once only, the spectator none', async () => {
        // Given
        const [a, b] = table();
        await loaded(a, b);
        await ready();

        // When
        await fire(3);
        ask((cylinder: Cylinder) => cylinder.requestShot(3));
        ask((cylinder: Cylinder) => cylinder.requestShot(CHAMBERS));
        ask((cylinder: Cylinder) => cylinder.requestShot(-1));
        await Promise.all([a, b].map(({ cylinder }) => cylinder.act()));

        // Then, the players giving their shares in any order
        expect(messagesOf(CylinderMessageType.SHARE).map((message: AppMessage) => `${ message.from } ${ (message.payload as CylinderShareMessage).chamber }`).sort())
            .toEqual(['a 3', 'b 3']);
    });

    test('should load nothing twice, nor the bullets of a spectator', async () => {
        // Given
        const [a, , c] = table();

        // When
        await a.cylinder.load(LOADS['a']);
        await a.cylinder.load([5, 6, 7]);
        await c.cylinder.load([5, 6, 7]);

        // Then
        await eventually(() => expect(messagesOf(CylinderMessageType.KEY)).toHaveLength(1));
        expect(a.cylinder.bullets()).toEqual(LOADS['a']);
        expect(c.cylinder.keyGiven).toBe(false);
    });

    test('should ignore the messages of a spectator, and a step out of its turn', async () => {
        // Given
        const [a, b, c] = table();
        await loaded(a, b);
        await ready();

        // When
        c.room.transmitMessage(CylinderMessageType.KEY, { game: ID, key: '4', proof: ['1', '1'], commitment: '0'.repeat(64) });
        b.room.transmitMessage(CylinderMessageType.LOAD, messagesOf(CylinderMessageType.LOAD, 'b')[0].payload as CylinderLoadMessage);
        b.room.transmitMessage(CylinderMessageType.SPIN, { game: ID, chambers: [] });
        b.room.transmitMessage(CylinderMessageType.SHARE, { game: ID, chamber: 5, share: '4', proof: ['1', '1'] });
        b.room.transmitMessage(CylinderMessageType.DISCLOSE, { game: ID, secret: '1' });
        await a.cylinder.act();

        // Then
        expect(hub.reports).toEqual([]);
        expect(a.cylinder.phase()).toEqual(CylinderPhase.READY);
    });

    test('should use the 2048-bit group by default', async () => {
        // Given
        const room: Room<CylinderPayloads> = hub.room('a');
        const cylinder = new Cylinder(room, { id: ID, players: ['a', 'b'] });

        // When
        await cylinder.load(LOADS['a']);

        // Then
        const key: string = (messagesOf(CylinderMessageType.KEY, 'a')[0].payload as { key: string }).key;
        expect(BigInt(`0x${ key }`).toString(2).length).toBeGreaterThan(2000);
    });

    test('should log a step failing, and go on', async () => {
        // Given a page whose share fails to be sent
        const [a, b] = table({
            b: (message: AppMessage) => {
                if (message.type === CylinderMessageType.SHARE) {
                    throw new Error('closed');
                }
                return message;
            },
        });
        await loaded(a, b);
        await ready();

        // When
        ask((cylinder: Cylinder) => cylinder.requestShot(0));

        // Then
        await eventually(() => expect(TimedLogger.error).toHaveBeenCalledWith(`The cylinder ${ ID } failed`, new Error('closed')));
    });

    describe('cheats', () => {
        test('should refuse a key without the proof of its player', async () => {
            // Given
            const [a, b, c] = table({ b: tampering(CylinderMessageType.KEY, (payload: object) => ({ ...payload, proof: ['1', '1'] })) });

            // When
            await loaded(a, b);

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_LOAD } b`));
            expect(c.cylinder.waitingFor()).toEqual(['b']);
        });

        test.each<[string, (payload: { key: string; commitment: string }) => object]>([
            ['a key out of the group', (payload) => ({ ...payload, key: '1' })],
            ['a malformed commitment', (payload) => ({ ...payload, commitment: 'x' })],
        ])('should refuse %s', async (_: string, change: (payload: { key: string; commitment: string }) => object) => {
            // Given
            const [a, b, c] = table({ b: tampering(CylinderMessageType.KEY, change) });

            // When
            await loaded(a, b);

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_LOAD } b`));
            expect(c.cylinder.phase()).toEqual(CylinderPhase.KEYS);
        });

        test('should refuse a load of 4 bullets, or of a chamber of 2', async () => {
            // Given a player proving 4 bullets
            const [a] = table();
            pages.get('b')?.cylinder.destroy();
            hub.close((pages.get('b') as Page).room);
            const b: Page = page('b', undefined, { bullets: 4 });

            // When
            await a.cylinder.load(LOADS['a']);
            await b.cylinder.load([6, 7, 8, 9]);

            // Then
            await eventually(() => expect(hub.reported()).toEqual(expect.arrayContaining([`a ${ CheatReason.INVALID_LOAD } b`, `c ${ CheatReason.INVALID_LOAD } b`])));
            // The load of a may come after the one of b, its proofs slower to make
            await eventually(() => expect(pages.get('c')?.cylinder.waitingFor()).toEqual(['b']));
            expect(pages.get('c')?.cylinder.phase()).toEqual(CylinderPhase.LOADING);
        });

        test('should refuse a load copied from the other player, which would cancel its bullets', async () => {
            // Given both keys in the chain, the load of b kept from it
            const [a, b] = table();
            await a.cylinder.load(LOADS['a']);
            await eventually(() => expect(messagesOf(CylinderMessageType.KEY)).toHaveLength(1));
            await b.cylinder.load(LOADS['b']);
            hub.hold('b');
            await eventually(() => expect(messagesOf(CylinderMessageType.LOAD, 'a')).toHaveLength(1));

            // When b sends the load of a as its own, with its own random part
            const nonce: string = (new SecretStore<CylinderSecrets>('cylinder', 'room', 'b').get(ID) as CylinderSecrets).nonce;
            hub.send({ from: 'b', type: CylinderMessageType.LOAD, payload: { ...(messagesOf(CylinderMessageType.LOAD, 'a')[0].payload as CylinderLoadMessage), nonce } });

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_LOAD } b`));
            hub.held.splice(0);
        });

        test.each<[string, (payload: CylinderLoadMessage) => object]>([
            ['a missing chamber', (payload) => ({ ...payload, chambers: payload.chambers.slice(1) })],
            ['a missing proof', (payload) => ({ ...payload, proofs: 'none' })],
        ])('should refuse a load with %s', async (_: string, change: (payload: CylinderLoadMessage) => object) => {
            // Given
            const [a, b] = table({ b: tampering(CylinderMessageType.LOAD, change) });

            // When
            await loaded(a, b);

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_LOAD } b`));
        });

        test.each<[string, unknown]>([['another random part', '0'.repeat(32)], ['no random part', 1]])('should refuse a load revealing %s than committed', async (_: string, nonce: unknown) => {
            // Given
            const [a, b] = table({ b: tampering(CylinderMessageType.LOAD, (payload: CylinderLoadMessage) => ({ ...payload, nonce })) });

            // When
            await loaded(a, b);

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_REVEAL } b`));
            expect(pages.get('c')?.cylinder.phase()).toEqual(CylinderPhase.LOADING);
        });

        test.each<[string, (payload: CylinderSpinMessage) => object]>([
            ['a chamber missing', (payload) => ({ ...payload, chambers: payload.chambers.slice(1) })],
            ['a chamber out of the group', (payload) => ({ ...payload, chambers: [['1', '1'], ...payload.chambers.slice(1)] })],
        ])('should break on a spin that is not a cylinder: %s', async (_: string, change: (payload: CylinderSpinMessage) => object) => {
            // Given
            const [a, b, c] = table({ b: tampering(CylinderMessageType.SPIN, change) });

            // When
            await loaded(a, b);

            // Then
            await eventually(() => expect(c.cylinder.phase()).toEqual(CylinderPhase.BROKEN));
            expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_SPIN } b`);
            expect(c.cylinder.waitingFor()).toEqual([]);

            // When the game stops
            ask((cylinder: Cylinder) => cylinder.requestDisclosure());

            // Then the players disclose their keys, nothing else applies, and the check names the player of the spin
            await eventually(() => expect(c.cylinder.verification()).toEqual(CylinderVerification.CHEATED));
            expect(messagesOf(CylinderMessageType.DISCLOSE).map((message: AppMessage) => message.from)).toEqual(['a', 'b']);
            expect(c.cylinder.cheaters()).toEqual(['b']);
            expect(hub.reported().filter((report: string) => report === `c ${ CheatReason.INVALID_SPIN } b`)).toHaveLength(1);
        });

        test('should find a spin made otherwise than turned once the keys are disclosed', async () => {
            // Given b turns the cylinder of a backwards
            const [a, b, c] = table({ b: tampering(CylinderMessageType.SPIN, (payload: CylinderSpinMessage) => ({ ...payload, chambers: [...payload.chambers].reverse() })) });
            await loaded(a, b);
            await ready();

            // When
            await fire(0);
            await disclose();

            // Then
            [a, b, c].forEach(({ cylinder }) => expect(cylinder.verification()).toEqual(CylinderVerification.CHEATED));
            expect(c.cylinder.cheaters()).toEqual(['b']);
            expect(hub.reported()).toEqual(expect.arrayContaining([`a ${ CheatReason.INVALID_SPIN } b`, `c ${ CheatReason.INVALID_SPIN } b`]));
        });

        test('should name the first spinner only when its spin hides a chamber of no count, the second one turning it', async () => {
            // Given a hides a bullet more three times in its first chamber, b turning the cylinder as the protocol says
            const key = (): bigint => cipher.multiplyValues([...hub.delivered].filter((message: AppMessage) => message.type === CylinderMessageType.KEY)
                .map((message: AppMessage) => cipher.parseValue((message.payload as { key: string }).key) as bigint));
            const [a, b, c] = table({
                a: tampering(CylinderMessageType.SPIN, (payload: CylinderSpinMessage) => ({
                    ...payload,
                    chambers: [
                        ExponentialElGamal.toHex(cipher.multiply(cipher.parseCipherText(payload.chambers[0]) as never, cipher.encrypt(3, key(), 5n))),
                        ...payload.chambers.slice(1),
                    ],
                })),
            });
            await loaded(a, b);
            await ready();

            // When
            await disclose();

            // Then
            expect(c.cylinder.verification()).toEqual(CylinderVerification.CHEATED);
            expect(c.cylinder.cheaters()).toEqual(['a']);
        });

        test('should refuse a share not made with the key of its player', async () => {
            // Given b gives the share giving another count
            const [a, b, c] = table({
                b: tampering(CylinderMessageType.SHARE, (payload: CylinderShareMessage) => ({ ...payload, share: (BigInt(`0x${ payload.share }`) * 4n % TEST_GROUP.prime).toString(16) })),
            });
            await loaded(a, b);
            await ready();

            // When
            ask((cylinder: Cylinder) => cylinder.requestShot(0));

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_SHARE } b`));
            expect(c.fired.size).toEqual(0);
            expect(c.cylinder.waitingFor()).toEqual(['b']);
        });

        test('should break on a chamber not holding 0 to 2 bullets', async () => {
            // Given b re-randomizes its spin with a bullet more in each chamber, the key of both being public
            const key = (): bigint => cipher.multiplyValues([...hub.delivered].filter((message: AppMessage) => message.type === CylinderMessageType.KEY)
                .map((message: AppMessage) => cipher.parseValue((message.payload as { key: string }).key) as bigint));
            const [a, b, c] = table({
                b: tampering(CylinderMessageType.SPIN, (payload: CylinderSpinMessage) => ({
                    ...payload,
                    chambers: payload.chambers.map((chamber) => ExponentialElGamal.toHex(cipher.multiply(cipher.parseCipherText(chamber) as never, cipher.encrypt(3, key(), 5n)))),
                })),
            });
            await loaded(a, b);
            await ready();

            // When
            ask((cylinder: Cylinder) => cylinder.requestShot(0));

            // Then
            await eventually(() => expect(c.cylinder.phase()).toEqual(CylinderPhase.BROKEN));
            expect(c.fired.size).toEqual(0);
        });

        test('should refuse a disclosure of another key', async () => {
            // Given
            const [a, b, c] = table({ b: tampering(CylinderMessageType.DISCLOSE, (payload: object) => ({ ...payload, secret: '2' })) });
            await loaded(a, b);
            await ready();

            // When
            ask((cylinder: Cylinder) => cylinder.requestDisclosure());

            // Then
            await eventually(() => expect(hub.reported()).toContain(`c ${ CheatReason.INVALID_SHARE } b`));
            expect(c.cylinder.verification()).toEqual(CylinderVerification.PENDING);
            expect(c.cylinder.waitingFor()).toEqual(['b']);
        });
    });

    describe('reload', () => {
        test('should load, spin and fire with the secrets the tab kept', async () => {
            // Given a reloaded once its key is in the chain
            const [a, b] = table();
            await a.cylinder.load(LOADS['a']);
            await eventually(() => expect(messagesOf(CylinderMessageType.KEY)).toHaveLength(1));
            const reloaded: Page = reload('a');

            // When
            await b.cylinder.load(LOADS['b']);
            await ready();
            const bullets: ReadonlyArray<number | undefined> = await fire(0);

            // Then
            expect(reloaded.cylinder.bullets()).toEqual(LOADS['a']);
            expect(new Set(bullets).size).toEqual(1);
            expect(messagesOf(CylinderMessageType.KEY, 'a')).toHaveLength(1);
            expect(hub.reports).toEqual([]);
        });

        test('should give its share again after a reload, the chain keeping the first one', async () => {
            // Given
            const [a, b] = table();
            await loaded(a, b);
            await ready();
            await fire(0);

            // When
            const reloaded: Page = reload('b');
            ask((cylinder: Cylinder) => cylinder.requestShot(1), [pages.get('a') as Page, pages.get('c') as Page]);
            ask((cylinder: Cylinder) => {
                cylinder.requestShot(0);
                cylinder.requestShot(1);
            }, [reloaded]);
            await eventually(() => expect(reloaded.fired.get(1)).toBeDefined());

            // Then
            expect(reloaded.fired.get(0)).toEqual(pages.get('a')?.fired.get(0));
            expect(hub.reports).toEqual([]);
        });

        test('should tell its secrets lost without the storage of the tab, giving nothing', async () => {
            // Given
            const [a, b] = table();
            await loaded(a, b);
            await ready();

            // When
            const reloaded: Page = reload('b', new SecretStore<CylinderSecrets>('cylinder', 'room', 'b', () => {
                throw new Error('blocked');
            }));
            ask((cylinder: Cylinder) => cylinder.requestShot(0));

            // Then
            await eventually(() => expect(reloaded.cylinder.secretsLost()).toBe(true));
            expect(reloaded.cylinder.bullets()).toEqual([]);
            await a.cylinder.act();
            expect(messagesOf(CylinderMessageType.SHARE, 'b')).toHaveLength(0);

            // When the game is over
            ask((cylinder: Cylinder) => cylinder.requestDisclosure());

            // Then
            await eventually(() => expect(messagesOf(CylinderMessageType.DISCLOSE, 'a')).toHaveLength(1));
            expect(messagesOf(CylinderMessageType.DISCLOSE, 'b')).toHaveLength(0);
        });

        test('should load, spin and fire with the storage of the tab blocked, the page keeping its secrets', async () => {
            // Given
            const blocked: SecretStore<CylinderSecrets> = new SecretStore<CylinderSecrets>('cylinder', 'room', 'a', () => {
                throw new Error('blocked');
            });
            const a: Page = page('a', undefined, { store: blocked });
            const [b] = [page('b'), page('c')];

            // When
            await loaded(a, b);
            await ready();

            // Then
            expect(a.cylinder.bullets()).toEqual(LOADS['a']);
            expect(a.cylinder.secretsLost()).toBe(false);
            expect(await fire(0)).toHaveLength(3);
            expect(hub.reports).toEqual([]);
        });

        test('should not tell its secrets lost once the cylinder is checked, its secrets removed', async () => {
            // Given a cylinder disclosed and checked
            const [a, b] = table();
            await loaded(a, b);
            await ready();
            await disclose();

            // When a reloads, the game over asking the keys again as the session does
            const former: Page = pages.get('a') as Page;
            former.cylinder.destroy();
            hub.close(former.room);
            const reloaded: Page = page('a');
            reloaded.cylinder.requestDisclosure();
            hub.replay(reloaded.room);
            await eventually(() => expect(reloaded.cylinder.verification()).toEqual(CylinderVerification.FAIR));

            // Then
            expect(reloaded.cylinder.secretsLost()).toBe(false);
            expect(TimedLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining('are lost'));
        });

        test('should load nothing without the storage of the tab', async () => {
            // Given a reloaded without its storage once its key is in the chain
            const [a, b, c] = table();
            await a.cylinder.load(LOADS['a']);
            await eventually(() => expect(messagesOf(CylinderMessageType.KEY)).toHaveLength(1));
            const reloaded: Page = reload('a', new SecretStore<CylinderSecrets>('cylinder', 'room', 'a', () => {
                throw new Error('blocked');
            }));

            // When
            await b.cylinder.load(LOADS['b']);

            // Then
            await eventually(() => expect(reloaded.cylinder.secretsLost()).toBe(true));
            await eventually(() => expect(c.cylinder.waitingFor()).toEqual(['a']));
            expect(messagesOf(CylinderMessageType.LOAD, 'a')).toHaveLength(0);
        });

        test('should drop secrets not making its key in the chain', async () => {
            // Given b loaded in a former page, whose key is held
            const [a, b] = table();
            hub.hold('b');
            await b.cylinder.load(LOADS['b']);

            // When its new page, its storage cleared, loads again
            sessionStorage.clear();
            const reloaded: Page = reload('b');
            hub.release();
            await reloaded.cylinder.load([5, 6, 7]);
            await a.cylinder.load(LOADS['a']);

            // Then
            await eventually(() => expect(reloaded.cylinder.secretsLost()).toBe(true));
            expect(new SecretStore<CylinderSecrets>('cylinder', 'room', 'b').get(ID)).toBeUndefined();
        });
    });
});
