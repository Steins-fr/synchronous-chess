import { RoomManager } from '../../room-manager/room-manager';
import { RoomService } from '../../../services/room/room.service';
import { NotifierFlow } from '../../notifier/notifier';
import SynchronousChessGameSession from './synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder from './synchronous-chess-game-session-builder';
import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';

describe('SynchronousChessGameSessionBuilder', () => {
    let roomServiceSpy: jasmine.SpyObj<RoomService>;
    let roomManagerSpy: jasmine.SpyObj<RoomManager>;

    beforeEach(() => {
        roomServiceSpy = jasmine.createSpyObj<RoomService>('RoomService', ['notifier']);
        roomManagerSpy = jasmine.createSpyObj<RoomManager>('RoomManager', ['notifier']);
        Object.defineProperty(roomServiceSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
        Object.defineProperty(roomManagerSpy, 'notifier', {
            value: jasmine.createSpyObj<NotifierFlow<any, any>>('NotifierFlow<any,any>', ['follow']),
            writable: false
        });
    });

    it('should create an instance of SynchronousChessOnlineHostGameSession', () => {
        // Given
        Object.defineProperty(roomManagerSpy, 'initiator', {
            value: true,
            writable: false
        });

        // When
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomServiceSpy, roomManagerSpy, undefined);

        // Then
        expect(session instanceof SynchronousChessOnlineHostGameSession).toBeTruthy();
    });

    it('should create an instance of SynchronousChessOnlinePeerGameSession', () => {
        // Given
        Object.defineProperty(roomManagerSpy, 'initiator', {
            value: false,
            writable: false
        });

        // When
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomServiceSpy, roomManagerSpy, undefined);

        // Then
        expect(session instanceof SynchronousChessOnlinePeerGameSession).toBeTruthy();
    });

    it('should create an instance of SynchronousChessOnlinePeerGameSession', () => {
        // Given

        // When
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildLocal(undefined);

        // Then
        expect(session instanceof SynchronousChessLocalGameSession).toBeTruthy();
    });
});
