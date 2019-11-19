import { HostRoomManager } from './host-room-manager';
import { RoomApiService } from 'src/app/services/room-api/room-api.service';
import { NotifierFlow } from '../notifier/notifier';

describe('HostRoom', () => {

    let roomApiServiceSpy: jasmine.SpyObj<RoomApiService>;

    beforeEach(() => {
        roomApiServiceSpy = jasmine.createSpyObj<RoomApiService>('RoomApiService', ['notifier']);
        Object.defineProperty(roomApiServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
    });

    it('should create an instance', () => {
        expect(new HostRoomManager(roomApiServiceSpy, '')).toBeTruthy();
    });
});
