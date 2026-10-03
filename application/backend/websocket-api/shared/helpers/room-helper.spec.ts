import Player from '@models/player';
import Room from '@models/room';
import { aRoom, GUEST_CONNECTION } from '@testing/api-mocks';
import { beforeEach, describe, expect, test } from 'vitest';
import RoomHelper from './room-helper';

describe('RoomHelper', () => {
    let room: Room;

    beforeEach(() => {
        room = aRoom({ players: [{ playerName: 'host' }, { playerName: 'player', connectionId: 'player-connection' }] });
    });

    test('should find a player of the room or of its queue by name', () => {
        expect(RoomHelper.getPlayerByName(room, 'host')).toEqual({ playerName: 'host' });
        expect(RoomHelper.getPlayerByName(room, 'guest')).toEqual({ playerName: 'guest', connectionId: GUEST_CONNECTION });
        expect(RoomHelper.getPlayerByName(room, 'unknown')).toBeNull();
    });

    test('should find a player of the room or of its queue by connection', () => {
        expect(RoomHelper.getPlayerByConnectionId(room, 'player-connection')).toEqual({ playerName: 'player', connectionId: 'player-connection' });
        expect(RoomHelper.getPlayerByConnectionId(room, GUEST_CONNECTION)).toEqual({ playerName: 'guest', connectionId: GUEST_CONNECTION });
        expect(RoomHelper.getPlayerByConnectionId(room, 'unknown')).toBeNull();
    });

    test('should tell whether a player is in the game or in the queue', () => {
        expect(RoomHelper.isInGame(room, 'host')).toEqual(true);
        expect(RoomHelper.isInGame(room, 'guest')).toEqual(false);
        expect(RoomHelper.isInQueue(room, 'guest')).toEqual(true);
        expect(RoomHelper.isInQueue(room, 'host')).toEqual(false);
    });

    test('should find no player in a missing list', () => {
        // Given: a room stored without queue
        const players: Player[] = room.queue;
        room = { ...room, queue: undefined as unknown as Player[] };

        // When / Then
        expect(RoomHelper.findPlayerByName(room.queue, 'guest')).toBeNull();
        expect(players).toHaveLength(1);
    });
});
