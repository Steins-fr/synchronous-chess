
import { Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { chessBlockChains, ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { SyncChessGameComponent } from '@app/modules/chess/components/sync-chess-game/sync-chess-game.component';
import { ChessPresentationComponent } from '@app/modules/chess/components/chess-presentation/chess-presentation.component';
import { ChessRulesComponent } from '@app/modules/chess/components/chess-rules/chess-rules.component';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { MatchPage } from '@app/modules/room-layout/leave-match.guard';
import { MatchLeaveWarning } from '@app/modules/room-layout/match-leave-warning';
import { provideRooms, roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-synchronous-chess',
    templateUrl: './synchronous-chess.html',
    imports: [
        RoomLayoutComponent, SyncChessGameComponent, ChatComponent, WebrtcDebugComponent, ChessPresentationComponent, ChessRulesComponent,
        TranslocoPipe,
    ],
    providers: [provideRooms()],
})
export class SynchronousChess implements MatchPage {
    protected readonly game: RoomGame = RoomGame.CHESS;
    protected readonly maxPlayer: number = 4;
    protected readonly room = roomFromSetup<ChatPayloads & ChessPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, chessBlockChains));
    public readonly leaveWarning: MatchLeaveWarning = inject(MatchLeaveWarning);
}
