import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';
import { pokerBlockChains, PokerPayloads } from '../../classes/game-sessions/seventeen-poker-session';
import { PokerPresentationComponent } from '../../components/poker-presentation/poker-presentation.component';
import { PokerRulesComponent } from '../../components/poker-rules/poker-rules.component';
import { PokerTableComponent } from '../../components/poker-table/poker-table.component';

/** The page of the Seventeen Poker: its rooms, each one holding a table and the chat */
@Component({
    selector: 'app-seventeen-poker',
    templateUrl: './seventeen-poker.html',
    imports: [
        RoomLayoutComponent, ChatComponent, WebrtcDebugComponent, PokerPresentationComponent, PokerRulesComponent, PokerTableComponent,
        TranslocoPipe,
    ],
    providers: [RoomSetupService, RoomManagerService, RoomSocketApi],
})
export class SeventeenPoker {
    protected readonly game: RoomGame = RoomGame.SEVENTEEN_POKER;
    // The 2 players and their spectators
    protected readonly maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads & PokerPayloads>(this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, pokerBlockChains));
}
