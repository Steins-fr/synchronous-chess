import SynchronousChessOnlineGameSession, { SCGameSessionType } from './synchronous-chess-online-game-session';
import { RoomService } from '../../../services/room/room.service';
import { NgZone } from '@angular/core';
import { Player } from '../../player/player';
import { RoomManager } from '../../room-manager/room-manager';
import { RoomEventType } from '../../room-manager/events/room-event';
import RoomPlayerAddEvent from '../../room-manager/events/room-player-add-event';
import RoomPlayerRemoveEvent from '../../room-manager/events/room-player-remove-event';

export default class SynchronousChessOnlineHostGameSession extends SynchronousChessOnlineGameSession {

    public constructor(roomService: RoomService, roomManager: RoomManager, ngZone: NgZone) {
        super(roomService, roomManager, ngZone);
        this.followRoomManager();
    }

    private followRoomManager(): void {
        this.roomManager.notifier.follow(RoomEventType.PLAYER_ADD, this, (event: RoomPlayerAddEvent) => this.onPlayerAdd(event.payload));
        this.roomManager.notifier.follow(RoomEventType.PLAYER_REMOVE, this, (event: RoomPlayerRemoveEvent) => this.onPlayerRemove(event.payload));
    }

    public onPlayerAdd(player: Player): void {

        if (this.configuration.whitePlayer === undefined) {
            this.configuration.whitePlayer = player.name;
        } else if (this.configuration.blackPlayer === undefined) {
            this.configuration.blackPlayer = player.name;
        } else {
            ++this.configuration.spectatorNumber;
        }

        this.roomService.transmitMessage(SCGameSessionType.CONFIGURATION, this.configuration);
    }

    public onPlayerRemove(player: Player): void {
        switch (player.name) {
            case this.configuration.whitePlayer:
                break;
            case this.configuration.blackPlayer:
                break;
            default:
                --this.configuration.spectatorNumber;
        }
    }
}
