import { hashPassword } from '@helpers/password.helper';
import { hashToken } from '@helpers/token.helper';
import Room from '@models/room';
import RoomCreateRequest from '@protocol/requests/room-create-request';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiErrorMessage } from '@protocol/room-api-error-message.enum';
import { RoomGame } from '@protocol/room-game.enum';
import RoomRepository from '@repositories/room-repository';
import { aRoom, browserOf, GUEST_CONNECTION, HOST_CONNECTION, HOST_TOKEN, readBrowserHashes, readRoom, storeConnection, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import RoomService from './room-service';

describe('RoomService', () => {
    useTestDatabase();
    let service: RoomService;
    let room: Room;

    // In epoch seconds
    const now: number = 1_800_000_000;
    const createRequest: RoomCreateRequest = { roomName: 'room', playerName: 'host', maxPlayer: 4, game: RoomGame.CHAT, token: HOST_TOKEN, browserId: browserOf('host') };

    /** One more room than listed, `room-0` the most recent */
    function storeMoreRoomsThanListed(): Promise<void[]> {
        return Promise.all(Array.from({ length: RoomService.MAX_OPEN_ROOMS + 1 }, (_room: unknown, index: number) => storeRoom(aRoom({
            id: `room-${ index }`,
            nameKey: `room-${ index }`,
            createdAt: new Date((now - index) * 1000).toISOString(),
        }))));
    }

    beforeEach(() => {
        // Date only: the timers of PGlite run
        vi.useFakeTimers({ now: now * 1000, toFake: ['Date'] });
        service = new RoomService();
        room = aRoom();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should let the room wait for its host when the host disconnects', async () => {
        // Given
        await storeRoom(room);

        // When
        await service.removeConnectionFromRoom(room, { connectionId: HOST_CONNECTION, roomName: 'room' });

        // Then
        expect(await readRoom('room')).toStrictEqual({ ...room, expiresAt: now + RoomService.HOST_RECONNECTION_DELAY });
    });

    test('should remove a disconnected guest from the queue', async () => {
        // Given
        await storeRoom(room);

        // When
        await service.removeConnectionFromRoom(room, { connectionId: GUEST_CONNECTION, roomName: 'room' });

        // Then
        expect(await readRoom('room')).toStrictEqual({ ...room, queue: [] });
    });

    test('should leave the room of a connection neither its host nor queued', async () => {
        // Given
        await storeRoom(room);
        const waitForHost = vi.spyOn(RoomRepository.prototype, 'waitForHost');
        const removePlayerFromQueue = vi.spyOn(RoomRepository.prototype, 'removePlayerFromQueue');

        // When: a former connection of the host
        await service.removeConnectionFromRoom(room, { connectionId: 'former-host-connection', roomName: 'room' });

        // Then
        expect(waitForHost).not.toHaveBeenCalled();
        expect(removePlayerFromQueue).not.toHaveBeenCalled();
        expect(await readRoom('room')).toStrictEqual(room);
    });

    test.each([
        ['with its host connected', aRoom()],
        ['waiting for its host past its lease', aRoom({ expiresAt: now + 1, leaseUntil: now })],
    ])('should get an existing room %s', async (_case: string, existing: Room) => {
        // Given
        await storeRoom(existing);

        // When / Then
        expect(await service.getRoomByName('room')).toStrictEqual(existing);
    });

    test.each([
        ['missing', aRoom({ id: 'other', nameKey: 'other' })],
        ['expired', aRoom({ expiresAt: now })],
        ['abandoned, its lease ended', aRoom({ leaseUntil: now })],
    ])('should report a %s room', async (_case: string, stored: Room) => {
        // Given
        await storeRoom(stored);

        // When / Then
        await expect(service.getRoomByName('room')).rejects.toThrow('Room \'room\' does not exist');
    });

    test('should only let the host edit the room', () => {
        expect(() => service.canEditRoomGuard(room, HOST_CONNECTION)).not.toThrow();
        expect(() => service.canEditRoomGuard(room, GUEST_CONNECTION)).toThrow('You are not the host of the room');
    });

    test('should let the host reconnect its room, and a player of the room take it over from a disconnected host', () => {
        // Given
        const players = [{ playerName: 'host' }, { playerName: 'player' }];

        // When / Then
        expect(() => service.reconnectHostGuard(room, 'host')).not.toThrow();
        expect(() => service.reconnectHostGuard(aRoom({ players, expiresAt: now + 1 }), 'player')).not.toThrow();
        expect(() => service.reconnectHostGuard(aRoom({ players }), 'player')).toThrow(RoomApiErrorMessage.HOST_CONNECTED);
        expect(() => service.reconnectHostGuard(aRoom({ expiresAt: now + 1 }), 'guest')).toThrow('You are not the host of the room');
    });

    test('should only reach the host of a room while connected', () => {
        expect(() => service.hostConnectedGuard(room)).not.toThrow();
        expect(() => service.hostConnectedGuard(aRoom({ expiresAt: now + 1 }))).toThrow(RoomApiErrorMessage.HOST_DISCONNECTED);
    });

    test('should list the most recent rooms of a game, full or waiting for their host, the host of a private one untold', async () => {
        // Given
        await storeRoom(aRoom({ id: 'alpha', nameKey: 'alpha', hostPlayer: 'alice', createdAt: '2026-10-11T10:00:00.000Z' }));
        await storeRoom(aRoom({ id: 'full', nameKey: 'full', maxPlayer: 1, createdAt: '2026-10-11T11:00:00.000Z', expiresAt: now + 60 }));
        await storeRoom(aRoom({
            id: 'zebra',
            nameKey: 'zebra',
            maxPlayer: 4,
            createdAt: '2026-10-11T12:00:00.000Z',
            players: [{ playerName: 'host' }, { playerName: 'guest' }],
            passwordHash: hashPassword('secret'),
        }));
        // Neither listed
        await storeRoom(aRoom({ id: 'expired', nameKey: 'expired', createdAt: '2026-10-11T13:00:00.000Z', expiresAt: now }));
        await storeRoom(aRoom({ id: 'chat', nameKey: 'chat', createdAt: '2026-10-11T14:00:00.000Z', game: RoomGame.CHAT }));

        // When / Then
        expect(await service.getOpenRooms(RoomGame.CHESS)).toEqual({
            rooms: [
                { roomName: 'zebra', playerCount: 2, maxPlayer: 4, isPrivate: true, hostConnected: true },
                { roomName: 'full', hostPlayer: 'host', playerCount: 1, maxPlayer: 1, isPrivate: false, hostConnected: false },
                { roomName: 'alpha', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true },
            ],
            hasMore: false,
        });
    });

    test('should list the 30 most recent rooms, telling more exist', async () => {
        // Given
        await storeMoreRoomsThanListed();
        const findRecentRooms = vi.spyOn(RoomRepository.prototype, 'findRecentRooms');

        // When
        const { rooms: listed, hasMore } = await service.getOpenRooms(RoomGame.CHESS);

        // Then: one more room read tells more exist
        expect(findRecentRooms).toHaveBeenCalledWith(RoomGame.CHESS, now, RoomService.MAX_OPEN_ROOMS + 1);
        expect(listed).toHaveLength(30);
        expect(listed[0].roomName).toEqual('room-0');
        expect(hasMore).toEqual(true);
    });

    test('should search the rooms whose name holds the search, whatever the case, the names starting with it first', async () => {
        // Given
        for (const name of ['Steve', 'Evening', 'Adam', 'EVE']) {
            await storeRoom(aRoom({ id: name, nameKey: name.toLowerCase() }));
        }
        // Neither listed
        await storeRoom(aRoom({ id: 'Eve expired', nameKey: 'eve expired', expiresAt: now }));
        await storeRoom(aRoom({ id: 'Eve chat', nameKey: 'eve chat', game: RoomGame.CHAT }));

        // When
        const { rooms, hasMore } = await service.getOpenRooms(RoomGame.CHESS, ' eVe ');

        // Then
        expect(rooms.map((listed: OpenRoom) => listed.roomName)).toEqual(['EVE', 'Evening', 'Steve']);
        expect(hasMore).toEqual(false);
    });

    test('should list the 30 first rooms of a search, telling more match', async () => {
        // Given
        await storeMoreRoomsThanListed();
        const findRoomsContaining = vi.spyOn(RoomRepository.prototype, 'findRoomsContaining');

        // When
        const { rooms, hasMore } = await service.getOpenRooms(RoomGame.CHESS, 'Room');

        // Then: one more room read tells more match
        expect(findRoomsContaining).toHaveBeenCalledWith(RoomGame.CHESS, 'room', now, RoomService.MAX_OPEN_ROOMS + 1);
        expect(rooms).toHaveLength(30);
        expect(hasMore).toEqual(true);
    });

    test('should let a player join a room of its game only', () => {
        expect(() => service.gameGuard(room, RoomGame.CHESS)).not.toThrow();
        expect(() => service.gameGuard(room, RoomGame.CHAT)).toThrow(RoomApiErrorMessage.OTHER_GAME);
    });

    test('should add and remove the players of the room', async () => {
        // Given
        await storeRoom(room);

        // When
        await service.addPlayerToRoom('guest', room);
        await service.removePlayerFromRoom('host', room);

        // Then
        expect(await readRoom('room')).toStrictEqual({ ...room, players: [{ playerName: 'guest' }] });
    });

    test('should not add a player twice to the room', async () => {
        // Given
        await storeRoom(room);
        const addPlayerToRoom = vi.spyOn(RoomRepository.prototype, 'addPlayerToRoom');

        // When
        await service.addPlayerToRoom('host', room);

        // Then: not even sent to the database
        expect(addPlayerToRoom).not.toHaveBeenCalled();
        expect(await readRoom('room')).toStrictEqual(room);
    });

    test('should refuse to queue a player of a name queued at the same time', async () => {
        // Given: the room read before the other player joined
        await storeRoom(room);

        // When / Then
        await expect(service.addPlayerToQueue('guest', 'other-connection', 'other-token', 'other-browser', aRoom({ queue: [] }))).rejects.toThrow(RoomApiErrorMessage.ALREADY_IN_QUEUE);
        expect(await readRoom('room')).toStrictEqual(room);
    });

    test('should queue a player with its connection, and the hashes of its token and its browser', async () => {
        // Given
        await storeRoom(room);

        // When
        await service.addPlayerToQueue('other', 'other-connection', 'other-token', 'other-browser', room);

        // Then
        expect(await readRoom('room')).toStrictEqual({
            ...room,
            queue: [...room.queue, { playerName: 'other', connectionId: 'other-connection' }],
            tokenHashes: { ...room.tokenHashes, other: hashToken('other-token') },
        });
        expect(await readBrowserHashes('room')).toMatchObject({ other: hashToken('other-browser') });
    });

    test('should create a room under its id with its host as only player, keeping the hashes of its token and its browser', async () => {
        // Given: a room of the same id expired now, another one waiting for its host a second more
        await storeRoom(aRoom({ id: 'room#000042', connectionId: 'former-connection', expiresAt: now }));
        const waiting: Room = aRoom({ id: 'waiting', nameKey: 'waiting', expiresAt: now + 1 });
        await storeRoom(waiting);

        // When
        const created: boolean = await service.create(createRequest, 'Room#000042', HOST_CONNECTION);

        // Then: searched by its whole id
        expect(created).toBe(true);
        expect(await readRoom('waiting')).toStrictEqual(waiting);
        expect(await readRoom('Room#000042')).toStrictEqual({
            id: 'Room#000042',
            connectionId: HOST_CONNECTION,
            hostPlayer: 'host',
            maxPlayer: 4,
            game: RoomGame.CHAT,
            createdAt: new Date(now * 1000).toISOString(),
            nameKey: 'room#000042',
            players: [{ playerName: 'host' }],
            queue: [],
            tokenHashes: { host: hashToken(HOST_TOKEN) },
            isPrivate: false,
            leaseUntil: now + RoomService.LEASE,
        });
        expect(await readBrowserHashes('Room#000042')).toEqual({ host: hashToken(browserOf('host')) });
    });

    test('should not create a room whose id is taken', async () => {
        // Given
        const existing: Room = aRoom({ connectionId: 'other-connection' });
        await storeRoom(existing);

        // When / Then
        expect(await service.create(createRequest, 'room', HOST_CONNECTION)).toBe(false);
        expect(await readRoom('room')).toStrictEqual(existing);
    });

    test('should give the tag following the highest one of the rooms of the name', async () => {
        // Given
        await storeRoom(aRoom({ id: 'room#000041' }));
        await storeRoom(aRoom({ id: 'room#000007' }));

        // When / Then
        expect(await service.nextRoomTag('room')).toEqual(42);
    });

    test('should give the lowest tag free once the last tag of the name is taken', async () => {
        // Given
        await storeRoom(aRoom({ id: 'room#000000' }));
        await storeRoom(aRoom({ id: 'room#999999' }));

        // When / Then
        expect(await service.nextRoomTag('room')).toEqual(1);
    });

    test('should give the first tag to the first room of the name', async () => {
        // When / Then
        expect(await service.nextRoomTag('room')).toEqual(0);
    });

    test('should move a room to another connection of its host', async () => {
        // Given: the room waits for its host a second more
        await storeRoom({ ...room, expiresAt: now + 1 });

        // When
        await service.reconnectHost(room, 'new-connection', 'host', HOST_TOKEN);

        // Then: its lease renewed
        expect(await readRoom('room')).toStrictEqual({ ...room, connectionId: 'new-connection', leaseUntil: now + RoomService.LEASE });
    });

    test('should refuse to move a room expired now', async () => {
        // Given
        await storeRoom({ ...room, expiresAt: now });

        // When / Then
        await expect(service.reconnectHost(room, 'new-connection', 'host', HOST_TOKEN)).rejects.toThrow('You are not the host of the room');
        expect(await readRoom('room')).toStrictEqual({ ...room, expiresAt: now });
    });

    test('should refuse to move a room for another token than its host\'s', async () => {
        // Given
        await storeRoom(room);

        // When / Then
        await expect(service.reconnectHost(room, 'new-connection', 'host', 'other-token')).rejects.toThrow('You are not the host of the room');
        expect(await readRoom('room')).toStrictEqual(room);
    });

    test('should renew the lease of the room a connection hosts, LEASE from now', async () => {
        // Given
        await storeRoom({ ...room, leaseUntil: now + 1 });
        await storeConnection({ connectionId: HOST_CONNECTION, roomName: 'room' });

        // When
        await service.renewLease(HOST_CONNECTION);

        // Then
        expect(await readRoom('room')).toStrictEqual({ ...room, leaseUntil: now + RoomService.LEASE });
    });
});
