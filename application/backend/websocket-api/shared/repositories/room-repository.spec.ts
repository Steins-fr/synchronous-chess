import { getDatabase } from '@database/database';
import { roomPasswordAttempts } from '@database/schema';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomGame } from '@protocol/room-game.enum';
import { aRoom, browserOf, GUEST_CONNECTION, HOST_CONNECTION, HOST_TOKEN, readBrowserHashes, readRoom, storeConnection, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { beforeEach, describe, expect, test } from 'vitest';
import RoomRepository, { ListedRoom } from './room-repository';

// In epoch seconds
const NOW: number = 1_800_000_000;
const LEASE_RENEWED: number = NOW + 1200;

/** A room listed, of `aRoom()` by default: its host, alone in its game, connected */
function aListedRoom(room: Partial<ListedRoom> = {}): ListedRoom {
    return { id: 'room', hostPlayer: 'host', maxPlayer: 2, isPrivate: false, playerCount: 1, ...room };
}

describe('RoomRepository', () => {
    useTestDatabase();
    let repository: RoomRepository;

    beforeEach(() => {
        repository = new RoomRepository();
    });

    describe('getByName', () => {
        test('should get a room with its players and its queue in the order they joined, and the hashes of its tokens', async () => {
            // Given
            const room: Room = aRoom({
                players: [{ playerName: 'zoe' }, { playerName: 'host' }],
                queue: [{ playerName: 'guest', connectionId: GUEST_CONNECTION }, { playerName: 'alice', connectionId: 'alice-connection' }],
                tokenHashes: { host: 'host-hash', zoe: 'zoe-hash', guest: 'guest-hash', alice: 'alice-hash', left: 'left-hash' },
            });
            await storeRoom(room);

            // When / Then
            expect(await repository.getByName('room')).toStrictEqual(room);
        });

        test('should get a private room waiting for its host', async () => {
            // Given
            const room: Room = aRoom({ passwordHash: 'password-hash', expiresAt: NOW + 600 });
            await storeRoom(room);

            // When / Then
            expect(await repository.getByName('room')).toStrictEqual(room);
        });

        test('should get no room without one of that name', async () => {
            // Given
            await storeRoom(aRoom({ id: 'other', nameKey: 'other' }));

            // When / Then
            expect(await repository.getByName('room')).toBeNull();
        });
    });

    describe('findRecentRooms', () => {
        test('should find the rooms of a game not expired, the last created first, the most rooms asked', async () => {
            // Given
            await storeRoom(aRoom({ id: 'oldest', nameKey: 'oldest', createdAt: '2026-10-11T10:00:00.000Z' }));
            // Waiting for its host past its lease: the wait for the host counts then
            await storeRoom(aRoom({ id: 'waiting', nameKey: 'waiting', createdAt: '2026-10-11T11:00:00.000Z', expiresAt: NOW + 1, leaseUntil: NOW }));
            await storeRoom(aRoom({ id: 'expired', nameKey: 'expired', createdAt: '2026-10-11T12:00:00.000Z', expiresAt: NOW }));
            await storeRoom(aRoom({ id: 'abandoned', nameKey: 'abandoned', createdAt: '2026-10-11T12:30:00.000Z', leaseUntil: NOW }));
            await storeRoom(aRoom({ id: 'chat', nameKey: 'chat', createdAt: '2026-10-11T13:00:00.000Z', game: RoomGame.CHAT }));
            await storeRoom(aRoom({ id: 'newest', nameKey: 'newest', createdAt: '2026-10-11T14:00:00.000Z', passwordHash: 'hash' }));

            // When / Then
            expect(await repository.findRecentRooms(RoomGame.CHESS, NOW, 30)).toStrictEqual([
                aListedRoom({ id: 'newest', isPrivate: true }),
                aListedRoom({ id: 'waiting', expiresAt: NOW + 1 }),
                aListedRoom({ id: 'oldest' }),
            ]);
            expect(await repository.findRecentRooms(RoomGame.CHESS, NOW, 2)).toHaveLength(2);
        });

        test('should count the players in the game of a room, not its queue', async () => {
            // Given
            await storeRoom(aRoom({ players: [{ playerName: 'host' }, { playerName: 'zoe' }] }));

            // When / Then
            expect(await repository.findRecentRooms(RoomGame.CHESS, NOW, 30)).toStrictEqual([aListedRoom({ playerCount: 2 })]);
        });
    });

    describe('findRoomsContaining', () => {
        test('should find the rooms of a game whose name holds the search, the names starting with it first, then by name', async () => {
            // Given
            for (const name of ['the evening', 'zeve', 'eve', 'evening', 'aaeve', 'adam']) {
                await storeRoom(aRoom({ id: name, nameKey: name }));
            }
            await storeRoom(aRoom({ id: 'eve-expired', nameKey: 'eve-expired', expiresAt: NOW }));
            await storeRoom(aRoom({ id: 'eve-chat', nameKey: 'eve-chat', game: RoomGame.CHAT }));

            // When
            const found: ListedRoom[] = await repository.findRoomsContaining(RoomGame.CHESS, 'eve', NOW, 30);

            // Then
            expect(found.map(({ id }: ListedRoom) => id)).toEqual(['eve', 'evening', 'aaeve', 'the evening', 'zeve']);
            expect(await repository.findRoomsContaining(RoomGame.CHESS, 'eve', NOW, 1)).toStrictEqual([aListedRoom({ id: 'eve' })]);
        });

        test('should find the room of the name searched before the longer names starting with it', async () => {
            // Given: the characters before the separator in their order
            await storeRoom(aRoom({ id: 'room!#000001' }));
            await storeRoom(aRoom({ id: 'room#000042' }));
            await storeRoom(aRoom({ id: 'Room#000007' }));

            // When / Then
            expect((await repository.findRoomsContaining(RoomGame.CHESS, 'room', NOW, 30)).map(({ id }: ListedRoom) => id))
                .toEqual(['Room#000007', 'room#000042', 'room!#000001']);
        });

        test('should find the rooms by their name only, not by the digits of their tags nor by the separator', async () => {
            // Given
            await storeRoom(aRoom({ id: 'friday#100001', nameKey: 'friday#100001' }));
            await storeRoom(aRoom({ id: 'room1#000042', nameKey: 'room1#000042' }));

            // When / Then
            expect((await repository.findRoomsContaining(RoomGame.CHESS, '1', NOW, 30)).map(({ id }: ListedRoom) => id)).toEqual(['room1#000042']);
            expect(await repository.findRoomsContaining(RoomGame.CHESS, 'day#', NOW, 30)).toStrictEqual([aListedRoom({ id: 'friday#100001' })]);
        });

        test('should find the rooms by their id for a search holding the separator, whatever the case', async () => {
            // Given
            await storeRoom(aRoom({ id: 'Friday#100001', nameKey: 'friday#100001' }));
            await storeRoom(aRoom({ id: 'friday#100002', nameKey: 'friday#100002' }));

            // When / Then
            expect(await repository.findRoomsContaining(RoomGame.CHESS, 'friday#100001', NOW, 30)).toStrictEqual([aListedRoom({ id: 'Friday#100001' })]);
            expect(await repository.findRoomsContaining(RoomGame.CHESS, '#100002', NOW, 30)).toStrictEqual([aListedRoom({ id: 'friday#100002' })]);
        });

        test.each([
            ['%', 'any text'],
            ['_', 'any character'],
            ['\\', 'the escape character'],
        ])('should find the rooms whose name holds %s, not %s', async (character: string) => {
            // Given
            await storeRoom(aRoom({ id: `a${ character }b`, nameKey: `a${ character }b` }));
            await storeRoom(aRoom({ id: 'axxb', nameKey: 'axxb' }));

            // When / Then
            expect(await repository.findRoomsContaining(RoomGame.CHESS, `a${ character }`, NOW, 30)).toStrictEqual([aListedRoom({ id: `a${ character }b` })]);
        });
    });

    describe('findLastTag', () => {
        test('should find the highest tag of the rooms of the name not expired, of any game and any case', async () => {
            // Given
            await storeRoom(aRoom({ id: 'friday#000009', nameKey: 'friday#000009' }));
            await storeRoom(aRoom({ id: 'friday#000042', nameKey: 'friday#000042', game: RoomGame.CHAT }));
            await storeRoom(aRoom({ id: 'friday#000099', nameKey: 'friday#000099', expiresAt: NOW }));
            await storeRoom(aRoom({ id: 'Friday#000098', nameKey: 'friday#000098' }));
            await storeRoom(aRoom({ id: 'friday#000097', nameKey: 'friday#000097' }));
            await storeRoom(aRoom({ id: 'friday-night#999999', nameKey: 'friday-night#999999' }));
            await storeRoom(aRoom({ id: 'fri#999999', nameKey: 'fri#999999' }));
            await storeRoom(aRoom({ id: 'friday', nameKey: 'friday' }));

            // When / Then
            expect(await repository.findLastTag('friday', NOW)).toEqual(98);
        });

        test('should find no tag without a room of the name', async () => {
            // Given
            await storeRoom(aRoom({ id: 'friday#000042', nameKey: 'friday#000042' }));

            // When / Then
            expect(await repository.findLastTag('monday', NOW)).toBeUndefined();
        });

        test.each([
            ['%', 'any text'],
            ['_', 'any character'],
            ['\\', 'the escape character'],
        ])('should find the tags of a name holding %s, not %s', async (character: string) => {
            // Given
            await storeRoom(aRoom({ id: `a${ character }b#000001`, nameKey: `a${ character }b#000001` }));
            await storeRoom(aRoom({ id: 'axxb#000002', nameKey: 'axxb#000002' }));

            // When / Then
            expect(await repository.findLastTag(`a${ character }b`, NOW)).toEqual(1);
        });
    });

    describe('findFirstFreeTag', () => {
        async function storeTags(name: string, ...tags: string[]): Promise<void> {
            for (const tag of tags) {
                await storeRoom(aRoom({ id: `${ name }#${ tag }`, nameKey: `${ name }#${ tag }`.toLowerCase() }));
            }
        }

        test('should find the first tag when no room of the name holds it', async () => {
            // Given
            await storeTags('friday', '000001', '999999');

            // When / Then
            expect(await repository.findFirstFreeTag('friday', NOW)).toEqual(0);
        });

        test('should find the lowest tag free after the tags taken', async () => {
            // Given
            await storeTags('friday', '000000', '000001', '000003', '000004', '999999');
            await storeTags('Friday', '000002');

            // When / Then: the tags of the name of another case counted
            expect(await repository.findFirstFreeTag('friday', NOW)).toEqual(5);
        });

        test('should find the tag of a room expired', async () => {
            // Given
            await storeTags('friday', '000000', '999999');
            await storeRoom(aRoom({ id: 'friday#000001', nameKey: 'friday#000001', expiresAt: NOW }));

            // When / Then
            expect(await repository.findFirstFreeTag('friday', NOW)).toEqual(1);
        });

        test('should find the tag following the highest one, below the last tag', async () => {
            // Given
            await storeTags('friday', '000000', '000001');

            // When / Then
            expect(await repository.findFirstFreeTag('friday', NOW)).toEqual(2);
        });

        test('should find no tag without a room of the name to read', async () => {
            // Given
            await storeTags('friday', '999999');

            // When / Then
            expect(await repository.findFirstFreeTag('monday', NOW)).toBeUndefined();
        });
    });

    describe('create', () => {
        test('should create a room with its host and the hashes of its token and its browser', async () => {
            // Given
            const room: Room = aRoom({ queue: [], tokenHashes: { host: hashToken(HOST_TOKEN) }, passwordHash: 'password-hash' });

            // When
            expect(await repository.create(room, 'host-browser-hash', NOW)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
            expect(await readBrowserHashes('room')).toEqual({ host: 'host-browser-hash' });
        });

        test.each([
            ['its host connected', {}],
            ['waiting for its host', { expiresAt: NOW + 1 }],
        ])('should not create a room whose name is taken by a room %s', async (_case: string, waiting: Partial<Room>) => {
            // Given
            const existing: Room = aRoom({ connectionId: 'other-connection', ...waiting });
            await storeRoom(existing);

            // When
            expect(await repository.create(aRoom({ queue: [] }), 'host-browser-hash', NOW)).toEqual(false);

            // Then
            expect(await readRoom('room')).toStrictEqual(existing);
        });

        test('should replace an expired room of the same name, without its players, queue, tokens and password attempts', async () => {
            // Given
            await storeRoom(aRoom({ players: [{ playerName: 'zoe' }], expiresAt: NOW }));
            await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: 5, expiresAt: NOW + 60 });
            const room: Room = aRoom({ queue: [], tokenHashes: { host: 'new-hash' } });

            // When
            expect(await repository.create(room, 'host-browser-hash', NOW)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
            expect(await getDatabase().select().from(roomPasswordAttempts)).toEqual([]);
        });

        test('should create no room of the id of a room of another case', async () => {
            // Given
            const existing: Room = aRoom({ id: 'Room#000042', connectionId: 'other-connection' });
            await storeRoom(existing);

            // When
            const created: boolean = await repository.create(aRoom({ id: 'room#000042' }), 'host-browser-hash', NOW);

            // Then
            expect(created).toBe(false);
            expect(await readRoom('Room#000042')).toStrictEqual(existing);
            expect(await readRoom('room#000042')).toBeNull();
        });

        test('should delete the other rooms expired, the ones whose lease ended included', async () => {
            // Given
            await storeRoom(aRoom({ id: 'expired', nameKey: 'expired', expiresAt: NOW }));
            await storeRoom(aRoom({ id: 'abandoned', nameKey: 'abandoned', leaseUntil: NOW }));
            await storeRoom(aRoom({ id: 'waiting', nameKey: 'waiting', expiresAt: NOW + 1, leaseUntil: NOW }));

            // When
            await repository.create(aRoom({ queue: [] }), 'host-browser-hash', NOW);

            // Then
            expect(await readRoom('expired')).toBeNull();
            expect(await readRoom('abandoned')).toBeNull();
            expect(await readRoom('waiting')).not.toBeNull();
        });
    });

    describe('waitForHost', () => {
        test('should let a room wait for its host', async () => {
            // Given
            const room: Room = aRoom();
            await storeRoom(room);

            // When
            await repository.waitForHost(room, HOST_CONNECTION, NOW + 600);

            // Then
            expect(await readRoom('room')).toStrictEqual({ ...room, expiresAt: NOW + 600 });
        });

        test('should leave a room its host already moved to another connection', async () => {
            // Given: the room read before the host reconnected it
            const room: Room = aRoom();
            await storeRoom({ ...room, connectionId: 'new-host-connection' });

            // When
            await repository.waitForHost(room, HOST_CONNECTION, NOW + 600);

            // Then
            expect((await readRoom('room'))?.expiresAt).toBeUndefined();
        });
    });

    describe('reconnectHost', () => {
        test.each([
            ['its host, connected', 'host', 'host-hash', {}],
            ['its host, waited for', 'host', 'host-hash', { expiresAt: NOW + 1 }],
            ['a player while it waits for its host', 'zoe', 'zoe-hash', { expiresAt: NOW + 1 }],
        ])('should move a room to a connection of %s, no longer waiting for its host', async (_case: string, playerName: string, tokenHash: string, waiting: Partial<Room>) => {
            // Given
            const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'zoe' }], tokenHashes: { host: 'host-hash', zoe: 'zoe-hash' } });
            await storeRoom({ ...room, ...waiting });

            // When
            expect(await repository.reconnectHost(room, 'new-connection', playerName, tokenHash, NOW, LEASE_RENEWED)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual({ ...room, connectionId: 'new-connection', hostPlayer: playerName, leaseUntil: LEASE_RENEWED });
        });

        test.each([
            ['the token of another player', 'host', 'zoe-hash', {}],
            ['a token unknown', 'host', 'other-hash', {}],
            ['a player while its host is connected', 'zoe', 'zoe-hash', {}],
            ['the host once the room expired', 'host', 'host-hash', { expiresAt: NOW }],
            ['the host once its lease ended', 'host', 'host-hash', { leaseUntil: NOW }],
        ])('should not move a room for %s', async (_case: string, playerName: string, tokenHash: string, waiting: Partial<Room>) => {
            // Given
            const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'zoe' }], tokenHashes: { host: 'host-hash', zoe: 'zoe-hash' }, ...waiting });
            await storeRoom(room);

            // When
            expect(await repository.reconnectHost(room, 'new-connection', playerName, tokenHash, NOW, LEASE_RENEWED)).toEqual(false);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
        });
    });

    describe('renewLease', () => {
        test('should renew the lease of the room the connection hosts', async () => {
            // Given
            await storeRoom(aRoom({ leaseUntil: NOW + 1 }));
            await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });

            // When
            await repository.renewLease(HOST_CONNECTION, NOW, LEASE_RENEWED);

            // Then
            expect((await readRoom('room'))?.leaseUntil).toBe(LEASE_RENEWED);
        });

        test.each([
            ['a former connection of its host', { connectionId: 'new-host-connection', leaseUntil: NOW + 1 }, 'room'],
            ['a connection of another room', { leaseUntil: NOW + 1 }, 'other'],
            ['once its lease ended', { leaseUntil: NOW }, 'room'],
        ])('should not renew the lease of a room for %s', async (_case: string, stored: Partial<Room>, roomName: string) => {
            // Given
            const room: Room = aRoom(stored);
            await storeRoom(room);
            await storeConnection({ connectionId: HOST_CONNECTION, roomName });

            // When
            await repository.renewLease(HOST_CONNECTION, NOW, LEASE_RENEWED);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
        });
    });

    describe('players', () => {
        test('should add a player to the game of the room once, after the others', async () => {
            // Given
            const room: Room = aRoom();
            await storeRoom(room);

            // When
            await repository.addPlayerToRoom({ playerName: 'guest' }, room);
            await repository.addPlayerToRoom({ playerName: 'guest' }, room);

            // Then
            expect((await readRoom('room'))?.players).toEqual([{ playerName: 'host' }, { playerName: 'guest' }]);
        });

        test('should remove a player from the game of the room, keeping the hash of its token', async () => {
            // Given
            const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'zoe' }], tokenHashes: { host: 'host-hash', zoe: 'zoe-hash' } });
            await storeRoom(room);

            // When
            await repository.removePlayerFromRoom('zoe', room);

            // Then
            expect(await readRoom('room')).toStrictEqual({ ...room, players: [{ playerName: 'host' }] });
        });

        test('should not remove a player out of the game of the room', async () => {
            await expect(repository.removePlayerFromRoom('guest', aRoom())).rejects.toThrow('Player not in the room');
        });
    });

    describe('queue', () => {
        test('should queue a player after the others, with the hashes of its token and its browser', async () => {
            // Given
            const room: Room = aRoom();
            await storeRoom(room);

            // When / Then
            expect(await repository.addPlayerToQueue({ playerName: 'zoe', connectionId: 'zoe-connection' }, 'zoe-hash', 'zoe-browser-hash', room)).toEqual(true);
            expect(await readRoom('room')).toStrictEqual({
                ...room,
                queue: [...room.queue, { playerName: 'zoe', connectionId: 'zoe-connection' }],
                tokenHashes: { ...room.tokenHashes, zoe: 'zoe-hash' },
            });
            expect(await readBrowserHashes('room')).toMatchObject({ zoe: 'zoe-browser-hash' });
        });

        test('should not queue a player of a name already queued, keeping the hash of its token', async () => {
            // Given: the guest joined under that name at the same time, the room read before
            const room: Room = aRoom();
            await storeRoom(room);

            // When / Then
            expect(await repository.addPlayerToQueue({ playerName: 'guest', connectionId: 'other-connection' }, 'other-hash', 'other-browser-hash', aRoom({ queue: [] }))).toEqual(false);
            expect(await readRoom('room')).toStrictEqual(room);
            expect(await readBrowserHashes('room')).toMatchObject({ guest: hashToken(browserOf('guest')) });
        });

        test('should replace the hashes of the token and the browser of a player joining the room again', async () => {
            // Given: the guest left the queue, its token kept
            const room: Room = aRoom({ queue: [] });
            await storeRoom(room);

            // When
            await repository.addPlayerToQueue({ playerName: 'guest', connectionId: 'new-guest-connection' }, 'new-guest-hash', 'new-guest-browser-hash', room);

            // Then
            expect(await readRoom('room')).toStrictEqual({
                ...room,
                queue: [{ playerName: 'guest', connectionId: 'new-guest-connection' }],
                tokenHashes: { ...room.tokenHashes, guest: 'new-guest-hash' },
            });
            expect(await readBrowserHashes('room')).toMatchObject({ guest: 'new-guest-browser-hash' });
        });

        test('should remove a player from the queue by its connection', async () => {
            // Given
            const room: Room = aRoom();
            await storeRoom(room);

            // When
            await repository.removePlayerFromQueue(GUEST_CONNECTION, room);

            // Then
            expect(await readRoom('room')).toStrictEqual({ ...room, queue: [] });
        });

        test('should not remove a connection out of the queue', async () => {
            await expect(repository.removePlayerFromQueue(HOST_CONNECTION, aRoom())).rejects.toThrow('Player not in the queue');
        });
    });
});
