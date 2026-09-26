import SynchronousChessOnlineGameSession, {
    SCGameSessionType
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Player } from '@app/services/room-manager/classes/player/player';
import { takeUntil } from 'rxjs';

export default class SynchronousChessOnlineHostGameSession extends SynchronousChessOnlineGameSession {

    public constructor(roomService: Room<RoomMessage>) {
        super(roomService);
        this.followRoomManager();
    }

    private followRoomManager(): void {
        this.roomService.playerAdded$.pipe(takeUntil(this.destroyRef)).subscribe((player: Player) => this.onPlayerAdd(player));
        this.roomService.playerRemoved$.pipe(takeUntil(this.destroyRef)).subscribe((player: Player) => this.onPlayerRemove(player));
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
