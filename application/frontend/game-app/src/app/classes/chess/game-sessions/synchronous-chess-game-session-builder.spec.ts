import SynchronousChessGameSession from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessGameSessionBuilder
    from '@app/classes/chess/game-sessions/synchronous-chess-game-session-builder';
import SynchronousChessLocalGameSession from '@app/classes/chess/game-sessions/synchronous-chess-local-game-session';
import SynchronousChessOnlineHostGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-peer-game-session';
import { NotifierFlow } from '@app/classes/notifier/notifier';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Subject } from 'rxjs';
import { getGetterSpy } from '@testing/test.helper';

describe('SynchronousChessGameSessionBuilder', () => {
    let roomSpy: jasmine.SpyObj<Room<any>>;

    beforeEach(() => {
        roomSpy = jasmine.createSpyObj<Room<any>>(
            'Room',
            ['messenger'],
            ['initiator', 'roomManagerNotifier']
        );

        getGetterSpy(roomSpy, 'roomManagerNotifier').and.returnValue(jasmine.createSpyObj<NotifierFlow<any>>('NotifierFlow<any,any>', ['follow']));

        // FIXME: better test this
        roomSpy.messenger.and.returnValues(
            (new Subject()).asObservable(),
            (new Subject()).asObservable(),
            (new Subject()).asObservable(),
        );
    });

    it('should create an instance of SynchronousChessOnlineHostGameSession', () => {
        getGetterSpy(roomSpy, 'initiator').and.returnValue(true);

        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomSpy);

        expect(session instanceof SynchronousChessOnlineHostGameSession).toBeTruthy();
    });

    it('should create an instance of SynchronousChessOnlinePeerGameSession', () => {
        getGetterSpy(roomSpy, 'initiator').and.returnValue(false);

        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildOnline(roomSpy);

        expect(session instanceof SynchronousChessOnlinePeerGameSession).toBeTruthy();
    });

    it('should create an instance of SynchronousChessOnlinePeerGameSession', () => {
        const session: SynchronousChessGameSession = SynchronousChessGameSessionBuilder.buildLocal();

        expect(session instanceof SynchronousChessLocalGameSession).toBeTruthy();
    });
});
