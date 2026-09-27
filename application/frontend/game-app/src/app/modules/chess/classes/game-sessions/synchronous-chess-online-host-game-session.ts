import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    SCGameSessionType
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import { Room } from '@app/services/room-manager/classes/room/room';
import { Player } from '@app/services/room-manager/classes/player/player';
import { takeUntil } from 'rxjs';

export default class SynchronousChessOnlineHostGameSession extends SynchronousChessOnlineGameSession {

    public constructor(roomService: Room<ChessPayloads>) {
        super(roomService);
        this.followRoomManager();
    }

    private followRoomManager(): void {
        this.roomService.playerAdded$.pipe(takeUntil(this.destroyRef)).subscribe((player: Player) => this.onPlayerAdd(player));
        this.roomService.playerRemoved$.pipe(takeUntil(this.destroyRef)).subscribe((player: Player) => this.onPlayerRemove(player));
    }

    public onPlayerAdd(player: Player): void {
        const configuration: Readonly<SessionConfiguration> = this.configuration();

        if (configuration.whitePlayer === undefined) {
            this.setConfiguration({ ...configuration, whitePlayer: player.name });
        } else if (configuration.blackPlayer === undefined) {
            this.setConfiguration({ ...configuration, blackPlayer: player.name });
        } else {
            this.setConfiguration({ ...configuration, spectatorNumber: configuration.spectatorNumber + 1 });
        }

        this.roomService.transmitMessage(SCGameSessionType.CONFIGURATION, this.configuration());
    }

    public onPlayerRemove(player: Player): void {
        const configuration: Readonly<SessionConfiguration> = this.configuration();

        switch (player.name) {
            case configuration.whitePlayer:
                break;
            case configuration.blackPlayer:
                break;
            default:
                this.setConfiguration({ ...configuration, spectatorNumber: configuration.spectatorNumber - 1 });
        }
    }
}
