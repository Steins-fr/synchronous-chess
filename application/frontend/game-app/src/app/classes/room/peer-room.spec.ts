import { PeerRoom } from './peer-room';
import { TestBed } from '@angular/core/testing';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';

describe('PeerRoom', () => {

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [RoomApiService]
        });
    });

    it('should create an instance', () => {
        expect(new PeerRoom(TestBed.get(RoomApiService))).toBeTruthy();
    });
});
