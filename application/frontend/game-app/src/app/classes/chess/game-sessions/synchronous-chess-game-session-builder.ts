import { RoomService } from '../../../services/room/room.service';
import { NgZone } from '@angular/core';
import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';
import SynchronousChessGameSession from './synchronous-chess-game-session';
import { RoomManager } from '../../room-manager/room-manager';

export default abstract class SynchronousChessGameSessionBuilder {
    public static buildOnline(roomService: RoomService, roomManager: RoomManager, ngZone: NgZone): SynchronousChessGameSession {
        if (roomManager.initiator) {
            return new SynchronousChessOnlineHostGameSession(roomService, roomManager, ngZone);
        }
        return new SynchronousChessOnlinePeerGameSession(roomService, roomManager, ngZone);
    }

    public static buildLocal(ngZone: NgZone): SynchronousChessGameSession {
        return new SynchronousChessLocalGameSession(ngZone);
    }
}
