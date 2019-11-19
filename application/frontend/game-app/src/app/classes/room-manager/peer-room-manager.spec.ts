import { PeerRoomManager } from './peer-room-manager';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';

describe('PeerRoom', () => {

    let roomApiServiceSpy: jasmine.SpyObj<RoomApiService>;

    beforeEach(() => {
        roomApiServiceSpy = jasmine.createSpyObj<RoomApiService>('RoomApiService', ['notifier']);
    });

    it('should create an instance', () => {
        expect(new PeerRoomManager(roomApiServiceSpy, '')).toBeTruthy();
    });
});
