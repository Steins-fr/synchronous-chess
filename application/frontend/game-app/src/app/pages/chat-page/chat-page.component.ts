import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ChatComponent } from '@app/components/chat/chat.component';
import { RoomLayoutComponent } from '@app/layouts/room-layout/room-layout.component';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat-page.component.html',
    standalone: true,
    imports: [CommonModule, RoomLayoutComponent, ChatComponent],
})
export class ChatPageComponent {
    public maxPlayer: number = 6;
}
