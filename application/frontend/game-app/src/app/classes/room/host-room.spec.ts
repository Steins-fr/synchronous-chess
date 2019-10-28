import { HostRoom } from './host-room';
import { TestBed } from '@angular/core/testing';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';

describe('HostRoom', () => {
    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [RoomApiService]
        });
    });

    it('should create an instance', () => {
        expect(new HostRoom(TestBed.get(RoomApiService))).toBeTruthy();
    });
});
