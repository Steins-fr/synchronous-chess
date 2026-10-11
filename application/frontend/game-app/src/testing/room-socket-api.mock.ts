import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { vi } from 'vitest';
import { TestHelper } from './test.helper';

/** The socket of a page whose requests list the open rooms given: its setup form lists them */
export function openRoomsSocketApi(rooms: OpenRoom[] = []): RoomSocketApi {
    return TestHelper.cast<RoomSocketApi>({ send: vi.fn().mockResolvedValue({ rooms, hasMore: false }) });
}
