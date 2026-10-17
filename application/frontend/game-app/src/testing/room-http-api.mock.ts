import { RoomHttpApi } from '@app/services/room-api/room-http.api';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { TestHelper } from './test.helper';

/** The HTTP API listing the open rooms given, whatever the request: the setup form of a page lists them */
export function openRoomsHttpApi(rooms: OpenRoom[] = []): RoomHttpApi {
    return TestHelper.cast<RoomHttpApi>({ getOpenRooms: vi.fn().mockReturnValue(of({ rooms, hasMore: false })) });
}
