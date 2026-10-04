
import { Component } from '@angular/core';
import { chessBlockChains, ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { SyncChessGameComponent } from '@app/modules/chess/components/sync-chess-game/sync-chess-game.component';
import { ChessPresentationComponent } from '@app/modules/chess/components/chess-presentation/chess-presentation.component';
import { ChessRulesComponent } from '@app/modules/chess/components/chess-rules/chess-rules.component';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { chatBlockChains, ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-synchronous-chess',
    templateUrl: './synchronous-chess.html',
    styleUrl: './synchronous-chess.scss',
    imports: [RoomLayoutComponent, SyncChessGameComponent, ChatComponent, WebrtcDebugComponent, ChessPresentationComponent, ChessRulesComponent],
    providers: [RoomSetupService, RoomManagerService, RoomSocketApi],
})
export class SynchronousChess {
    protected readonly maxPlayer: number = 4;
    protected readonly room = roomFromSetup<ChatPayloads & ChessPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, chessBlockChains));
}
