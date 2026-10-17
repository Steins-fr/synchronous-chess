import { getDatabase } from '@database/database';
import { roomPasswordAttempts } from '@database/schema';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import { RoomGame } from '@protocol/room-game.enum';
import { aRoom, GUEST_CONNECTION, HOST_CONNECTION, HOST_TOKEN, readRoom, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { beforeEach, describe, expect, test } from 'vitest';
import RoomRepository, { ListedRoom } from './room-repository';

// In epoch seconds
const NOW: number = 1_800_000_000;

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
            await storeRoom(aRoom({ id: 'waiting', nameKey: 'waiting', createdAt: '2026-10-11T11:00:00.000Z', expiresAt: NOW + 1 }));
            await storeRoom(aRoom({ id: 'expired', nameKey: 'expired', createdAt: '2026-10-11T12:00:00.000Z', expiresAt: NOW }));
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

    describe('create', () => {
        test('should create a room with its host and the hash of its token', async () => {
            // Given
            const room: Room = aRoom({ queue: [], tokenHashes: { host: hashToken(HOST_TOKEN) }, passwordHash: 'password-hash' });

            // When
            expect(await repository.create(room, NOW)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
        });

        test.each([
            ['its host connected', {}],
            ['waiting for its host', { expiresAt: NOW + 1 }],
        ])('should not create a room whose name is taken by a room %s', async (_case: string, waiting: Partial<Room>) => {
            // Given
            const existing: Room = aRoom({ connectionId: 'other-connection', ...waiting });
            await storeRoom(existing);

            // When
            expect(await repository.create(aRoom({ queue: [] }), NOW)).toEqual(false);

            // Then
            expect(await readRoom('room')).toStrictEqual(existing);
        });

        test('should replace an expired room of the same name, without its players, queue, tokens and password attempts', async () => {
            // Given
            await storeRoom(aRoom({ players: [{ playerName: 'zoe' }], expiresAt: NOW }));
            await getDatabase().insert(roomPasswordAttempts).values({ roomId: 'room', sourceHash: 'source', attempts: 5, expiresAt: NOW + 60 });
            const room: Room = aRoom({ queue: [], tokenHashes: { host: 'new-hash' } });

            // When
            expect(await repository.create(room, NOW)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual(room);
            expect(await getDatabase().select().from(roomPasswordAttempts)).toEqual([]);
        });

        test('should delete the other rooms expired', async () => {
            // Given
            await storeRoom(aRoom({ id: 'expired', nameKey: 'expired', expiresAt: NOW }));
            await storeRoom(aRoom({ id: 'waiting', nameKey: 'waiting', expiresAt: NOW + 1 }));

            // When
            await repository.create(aRoom({ queue: [] }), NOW);

            // Then
            expect(await readRoom('expired')).toBeNull();
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
            expect(await repository.reconnectHost(room, 'new-connection', playerName, tokenHash, NOW)).toEqual(true);

            // Then
            expect(await readRoom('room')).toStrictEqual({ ...room, connectionId: 'new-connection', hostPlayer: playerName });
        });

        test.each([
            ['the token of another player', 'host', 'zoe-hash', {}],
            ['a token unknown', 'host', 'other-hash', {}],
            ['a player while its host is connected', 'zoe', 'zoe-hash', {}],
            ['the host once the room expired', 'host', 'host-hash', { expiresAt: NOW }],
        ])('should not move a room for %s', async (_case: string, playerName: string, tokenHash: string, waiting: Partial<Room>) => {
            // Given
            const room: Room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'zoe' }], tokenHashes: { host: 'host-hash', zoe: 'zoe-hash' }, ...waiting });
            await storeRoom(room);

            // When
            expect(await repository.reconnectHost(room, 'new-connection', playerName, tokenHash, NOW)).toEqual(false);

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
        test('should queue a player after the others, with the hash of its token', async () => {
            // Given
            const room: Room = aRoom();
            await storeRoom(room);

            // When
            await repository.addPlayerToQueue({ playerName: 'zoe', connectionId: 'zoe-connection' }, 'zoe-hash', room);

            // Then
            expect(await readRoom('room')).toStrictEqual({
                ...room,
                queue: [...room.queue, { playerName: 'zoe', connectionId: 'zoe-connection' }],
                tokenHashes: { ...room.tokenHashes, zoe: 'zoe-hash' },
            });
        });

        test('should replace the hash of the token of a player joining the room again', async () => {
            // Given: the guest left the queue, its token kept
            const room: Room = aRoom({ queue: [] });
            await storeRoom(room);

            // When
            await repository.addPlayerToQueue({ playerName: 'guest', connectionId: 'new-guest-connection' }, 'new-guest-hash', room);

            // Then
            expect(await readRoom('room')).toStrictEqual({
                ...room,
                queue: [{ playerName: 'guest', connectionId: 'new-guest-connection' }],
                tokenHashes: { ...room.tokenHashes, guest: 'new-guest-hash' },
            });
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
