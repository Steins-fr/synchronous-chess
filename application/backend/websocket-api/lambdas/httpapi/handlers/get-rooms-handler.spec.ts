import RoomRepository from '@repositories/room-repository';
import { anHttpEvent, aRoom, storeRoom } from '@testing/api-mocks';
import { useTestDatabase } from '@testing/database';
import { describe, expect, test, vi } from 'vitest';
import { getRoomsHandler } from './get-rooms-handler';

describe('getRoomsHandler', () => {
    useTestDatabase();

    function getRooms(rawQueryString: string): ReturnType<typeof getRoomsHandler> {
        return getRoomsHandler(anHttpEvent('GET /rooms', rawQueryString));
    }

    test('should list the most recent rooms of the game, without the host of a private room', async () => {
        // Given
        await storeRoom(aRoom({ id: 'private', nameKey: 'private', hostPlayer: 'secret', passwordHash: 'hash', createdAt: '2026-10-11T10:00:00.000Z' }));
        await storeRoom(aRoom({ id: 'other', nameKey: 'other', hostPlayer: 'other', createdAt: '2026-10-11T11:00:00.000Z' }));
        await storeRoom(aRoom());

        // When
        const response = await getRooms('game=chess');

        // Then
        expect(response).toEqual({
            rooms: [
                { roomName: 'room', hostPlayer: 'host', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true },
                { roomName: 'other', hostPlayer: 'other', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true },
                { roomName: 'private', playerCount: 1, maxPlayer: 2, isPrivate: true, hostConnected: true },
            ],
            hasMore: false,
        });
    });

    test('should list the rooms matching the search', async () => {
        // Given a room whose name holds the search, whatever its case, and a room whose name does not
        await storeRoom(aRoom());
        await storeRoom(aRoom({ id: 'other', nameKey: 'other', hostPlayer: 'other' }));

        // When
        const response = await getRooms('game=chess&search=OTH');

        // Then
        expect(response).toEqual({ rooms: [expect.objectContaining({ roomName: 'other' })], hasMore: false });
    });

    test('should list the most recent rooms for an empty search', async () => {
        // Given
        await storeRoom(aRoom({ id: 'other', nameKey: 'other', hostPlayer: 'other', createdAt: '2026-10-11T11:00:00.000Z' }));
        await storeRoom(aRoom());

        // When
        const response = await getRooms('game=chess&search=');

        // Then
        expect(response.rooms.map(({ roomName }: { roomName: string }) => roomName)).toEqual(['room', 'other']);
    });

    test.each<[string, string, string]>([
        ['a plus sign', 'A%2BB', 'a+b'],
        ['a space', 'A%20B', 'a b'],
        ['a space encoded as a plus sign, like a form', 'A+B', 'a b'],
    ])('should decode %s in the search like the browsers', async (_case: string, search: string, roomName: string) => {
        // Given
        await storeRoom(aRoom({ id: 'a+b', nameKey: 'a+b' }));
        await storeRoom(aRoom({ id: 'a b', nameKey: 'a b', hostPlayer: 'other' }));

        // When
        const response = await getRooms(`game=chess&search=${ search }`);

        // Then
        expect(response.rooms).toEqual([expect.objectContaining({ roomName })]);
    });

    test.each<[string, string]>([
        ['no game', ''],
        ['a search without game', 'search=room'],
        ['an unknown game', 'game=go'],
        ['a game given twice', 'game=chess&game=chess'],
        ['a search given twice', 'game=chess&search=a&search=b'],
        ['a too long search', `game=chess&search=${ 's'.repeat(65) }`],
        ['a search with the NUL character, which PostgreSQL refuses', 'game=chess&search=a%00'],
    ])('should refuse a request with %s', async (_case: string, rawQueryString: string) => {
        // Given
        const findRecentRooms = vi.spyOn(RoomRepository.prototype, 'findRecentRooms');
        const findRoomsContaining = vi.spyOn(RoomRepository.prototype, 'findRoomsContaining');

        // When / Then
        await expect(getRooms(rawQueryString)).rejects.toThrow('Payload not valid');
        expect(findRecentRooms).not.toHaveBeenCalled();
        expect(findRoomsContaining).not.toHaveBeenCalled();
    });
});
