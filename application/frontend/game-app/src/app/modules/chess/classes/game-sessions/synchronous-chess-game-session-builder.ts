import SynchronousChessGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessLocalGameSession from '@app/modules/chess/classes/game-sessions/synchronous-chess-local-game-session';
import SynchronousChessOnlineGameSession, { ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { Room } from '@app/services/room-manager/classes/room/room';

export default abstract class SynchronousChessGameSessionBuilder {
    public static buildOnline(roomService: Room<ChessPayloads>): SynchronousChessGameSession {
        return new SynchronousChessOnlineGameSession(roomService);
    }

    public static buildLocal(): SynchronousChessGameSession {
        return new SynchronousChessLocalGameSession();
    }
}
