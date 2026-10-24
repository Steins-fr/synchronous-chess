
import { Component } from '@angular/core';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { provideRooms, roomFromSetup } from '../room-layout/room-from-setup';
import { RoomGame } from '@protocol/room-game.enum';
import { chatBlockChains, ChatComponent, ChatPayloads } from './components/chat/chat.component';
import { WebrtcDebugComponent } from '../debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat.page.html',
    imports: [RoomLayoutComponent, ChatComponent, WebrtcDebugComponent],
    providers: [provideRooms()],
})
export class ChatPage {
    public readonly game: RoomGame = RoomGame.CHAT;
    public maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads>(this.maxPlayer, chatBlockChains);
}
