import { SessionConfiguration } from '@app/classes/chess/game-sessions/synchronous-chess-game-session';
import SynchronousChessOnlineGameSession, {
    SCGameSessionType
} from '@app/classes/chess/game-sessions/synchronous-chess-online-game-session';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { ToReworkMessage } from '@app/classes/webrtc/messages/to-rework-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { takeUntil } from 'rxjs';

export default class SynchronousChessOnlinePeerGameSession extends SynchronousChessOnlineGameSession {
    public constructor(roomService: Room<RoomMessage>) {
        super(roomService);
        this.roomService.messenger(SCGameSessionType.CONFIGURATION).pipe(takeUntil(this.destroyRef)).subscribe(this.onConfiguration.bind(this));
    }

    public onConfiguration(configurationMessage: ToReworkMessage<SessionConfiguration>): void {
        // FIXME: prevent reception from other than host
        this.configuration = configurationMessage.payload;
    }
}
