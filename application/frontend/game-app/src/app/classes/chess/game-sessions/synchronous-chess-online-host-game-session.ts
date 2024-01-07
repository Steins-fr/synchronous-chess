import SynchronousChessOnlineGameSession, {
    SCGameSessionType
} from '@app/classes/chess/game-sessions/synchronous-chess-online-game-session';
import { Player } from '@app/classes/player/player';
import { RoomEventType } from '@app/classes/room-manager/events/room-event';
import RoomPlayerAddEvent from '@app/classes/room-manager/events/room-player-add-event';
import RoomPlayerRemoveEvent from '@app/classes/room-manager/events/room-player-remove-event';
import { RoomService } from '@app/services/room/room.service';

export default class SynchronousChessOnlineHostGameSession extends SynchronousChessOnlineGameSession {

    public constructor(roomService: RoomService<any>) {
        super(roomService);
        this.followRoomManager();
    }

    private followRoomManager(): void {
        this.roomService.roomManagerNotifier.follow(RoomEventType.PLAYER_ADD, this, (event: RoomPlayerAddEvent) => this.onPlayerAdd(event.payload));
        this.roomService.roomManagerNotifier.follow(RoomEventType.PLAYER_REMOVE, this, (event: RoomPlayerRemoveEvent) => this.onPlayerRemove(event.payload));
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
