import { SessionConfiguration } from '@app/modules/chess/classes/game-sessions/synchronous-chess-game-session';
import SynchronousChessOnlineGameSession, {
    ChessPayloads,
    SCGameSessionType
} from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { AppMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { Room } from '@app/services/room-manager/classes/room/room';
import { takeUntil } from 'rxjs';

export default class SynchronousChessOnlinePeerGameSession extends SynchronousChessOnlineGameSession {
    public constructor(roomService: Room<ChessPayloads>) {
        super(roomService);
        this.roomService.messenger(SCGameSessionType.CONFIGURATION).pipe(takeUntil(this.destroyRef)).subscribe((message) => this.onConfiguration(message));
    }

    public onConfiguration(configurationMessage: AppMessage<SCGameSessionType.CONFIGURATION, SessionConfiguration>): void {
        // FIXME: prevent reception from other than host
        this.setConfiguration(configurationMessage.payload);
    }
}
