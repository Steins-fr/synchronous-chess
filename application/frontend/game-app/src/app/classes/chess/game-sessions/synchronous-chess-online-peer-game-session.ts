import { SessionConfiguration } from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessOnlineGameSession, {
    SCGameSessionType
} from '@app/classes/chess/game-sessions/synchronous-chess-online-game-session';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { RoomService } from '@app/services/room/room.service';
import { takeUntil } from 'rxjs';

export default class SynchronousChessOnlinePeerGameSession extends SynchronousChessOnlineGameSession {
    public constructor(roomService: RoomService<any>) {
        super(roomService);
        this.roomService.messenger(SCGameSessionType.CONFIGURATION).pipe(takeUntil(this.destroyRef)).subscribe(this.onConfiguration.bind(this));
    }

    public onConfiguration(configurationMessage: RoomMessage<SessionConfiguration>): void {
        // TODO: prevent reception from other than host
        this.configuration = configurationMessage.payload;
    }
}
