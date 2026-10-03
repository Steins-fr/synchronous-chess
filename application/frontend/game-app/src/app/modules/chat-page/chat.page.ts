
import { Component } from '@angular/core';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { roomFromSetup } from '../room-layout/room-from-setup';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { chatBlockChains, ChatComponent, ChatPayloads } from './components/chat/chat.component';
import { WebrtcDebugComponent } from '../debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat.page.html',
    imports: [RoomLayoutComponent, ChatComponent, WebrtcDebugComponent],
    providers: [RoomSetupService, RoomManagerService],
})
export class ChatPage {
    public maxPlayer: number = 6;
    public readonly room = roomFromSetup<ChatPayloads>(this.maxPlayer, chatBlockChains);
}
