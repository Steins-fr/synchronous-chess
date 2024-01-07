import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ChatComponent } from '@app/components/chat/chat.component';
import { SyncChessGameComponent } from '@app/components/sync-chess-game/sync-chess-game.component';
import { RoomLayoutComponent } from '@app/layouts/room-layout/room-layout.component';

@Component({
    selector: 'app-synchronous-chess-page',
    templateUrl: './synchronous-chess-page.component.html',
    standalone: true,
    imports: [CommonModule, RoomLayoutComponent, SyncChessGameComponent, ChatComponent],
})
export class SynchronousChessPageComponent {
    public maxPlayer: number = 4;
}
