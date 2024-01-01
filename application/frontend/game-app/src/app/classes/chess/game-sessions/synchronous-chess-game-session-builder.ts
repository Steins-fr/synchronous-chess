import SynchronousChessGameSession from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessLocalGameSession from '@app/classes/chess/game-sessions/synchronous-chess-local-game-session';
import SynchronousChessOnlineHostGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession
    from '@app/classes/chess/game-sessions/synchronous-chess-online-peer-game-session';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';

export default abstract class SynchronousChessGameSessionBuilder {
    public static buildOnline(roomService: Room<RoomMessage>): SynchronousChessGameSession {
        if (roomService.initiator) {
            return new SynchronousChessOnlineHostGameSession(roomService);
        }
        return new SynchronousChessOnlinePeerGameSession(roomService);
    }

    public static buildLocal(): SynchronousChessGameSession {
        return new SynchronousChessLocalGameSession();
    }
}
