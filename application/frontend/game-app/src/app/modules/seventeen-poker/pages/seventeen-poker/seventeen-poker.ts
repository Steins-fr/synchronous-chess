import { Component } from '@angular/core';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { roomFromSetup } from '@app/modules/room-layout/room-from-setup';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';
import { PokerPresentationComponent } from '../../components/poker-presentation/poker-presentation.component';

/** The page of the Seventeen Poker: its rooms, holding the chat */
@Component({
    selector: 'app-seventeen-poker',
    templateUrl: './seventeen-poker.html',
    imports: [RoomLayoutComponent, ChatComponent, WebrtcDebugComponent, PokerPresentationComponent],
    providers: [RoomSetupService, RoomManagerService, RoomSocketApi],
})
export class SeventeenPoker {
    protected readonly game: RoomGame = RoomGame.SEVENTEEN_POKER;
    // The 2 players and their spectators
    protected readonly maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads>(this.maxPlayer, chatBlockChains);
}
