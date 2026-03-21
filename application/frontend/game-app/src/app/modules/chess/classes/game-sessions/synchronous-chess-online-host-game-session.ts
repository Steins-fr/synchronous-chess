import SynchronousChessOnlineGameSession, {
    SCGameSessionType
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomNetworkEventType } from '@app/services/room-manager/classes/room-network/events/room-network-event';
import RoomNetworkPlayerAddEvent from '@app/services/room-manager/classes/room-network/events/room-network-player-add-event';
import RoomNetworkPlayerRemoveEvent from '@app/services/room-manager/classes/room-network/events/room-network-player-remove-event';
import { Player } from '@app/services/room-manager/classes/player/player';

export default class SynchronousChessOnlineHostGameSession extends SynchronousChessOnlineGameSession {

    public constructor(roomService: Room<RoomMessage>) {
        super(roomService);
        this.followRoomManager();
    }

    private followRoomManager(): void {
        this.roomService.roomManagerNotifier.follow(RoomNetworkEventType.PLAYER_ADD, this, (event: RoomNetworkPlayerAddEvent) => this.onPlayerAdd(event.payload));
        this.roomService.roomManagerNotifier.follow(RoomNetworkEventType.PLAYER_REMOVE, this, (event: RoomNetworkPlayerRemoveEvent) => this.onPlayerRemove(event.payload));
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
