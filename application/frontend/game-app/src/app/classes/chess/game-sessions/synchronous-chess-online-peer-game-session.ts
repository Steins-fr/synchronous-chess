import SynchronousChessOnlineGameSession, { SCGameSessionType } from './synchronous-chess-online-game-session';
import { RoomService } from '../../../services/room/room.service';
import { NgZone } from '@angular/core';
import { RoomMessage } from '../../webrtc/messages/room-message';
import { SessionConfiguration } from './synchronous-chess-game-session';
import { RoomManager } from '../../room-manager/room-manager';

export default class SynchronousChessOnlinePeerGameSession extends SynchronousChessOnlineGameSession {
    public constructor(roomService: RoomService, roomManager: RoomManager, ngZone: NgZone) {
        super(roomService, roomManager, ngZone);
        this.followRoomService();
    }

    private followRoomService(): void {
        this.roomService.notifier.follow(SCGameSessionType.CONFIGURATION, this,
            (configurationMessage: RoomMessage<SessionConfiguration>) => this.onConfiguration(configurationMessage.payload));
    }

    public onConfiguration(configuration: SessionConfiguration): void {

        // TODO: prevent reception from other than host
        this.ngZone.run(() => this.configuration = configuration);
    }
}
