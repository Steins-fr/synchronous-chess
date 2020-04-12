import { RoomService } from '../../../services/room/room.service';
import { NgZone } from '@angular/core';
import SynchronousChessOnlineHostGameSession from './synchronous-chess-online-host-game-session';
import SynchronousChessOnlinePeerGameSession from './synchronous-chess-online-peer-game-session';
import SynchronousChessLocalGameSession from './synchronous-chess-local-game-session';
import SynchronousChessGameSession from './synchronous-chess-game-session';

export default abstract class SynchronousChessGameSessionBuilder {
    public static buildOnline(roomService: RoomService, ngZone: NgZone): SynchronousChessGameSession {
        if (roomService.initiator) {
            return new SynchronousChessOnlineHostGameSession(roomService, ngZone);
        }
        return new SynchronousChessOnlinePeerGameSession(roomService, ngZone);
    }

    public static buildLocal(ngZone: NgZone): SynchronousChessGameSession {
        return new SynchronousChessLocalGameSession(ngZone);
    }
}
