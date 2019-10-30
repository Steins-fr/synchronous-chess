import { HostRoomManager } from './host-room-manager';
import { TestBed } from '@angular/core/testing';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';

describe('HostRoom', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [RoomApiService]
        });
    });

    it('should create an instance', () => {
        expect(new HostRoomManager(TestBed.get(RoomApiService))).toBeTruthy();
    });
});
