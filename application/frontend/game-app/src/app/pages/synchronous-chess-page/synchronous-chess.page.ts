import { CommonModule } from '@angular/common';
import { Component, inject, DestroyRef, OnInit, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { ChatComponent, ChatMessengerType } from '@app/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/components/shared/debug/webrtc-debug/webrtc-debug.component';
import { SyncChessGameComponent } from '@app/components/sync-chess-game/sync-chess-game.component';
import { RoomLayoutComponent } from '@app/layouts/room-layout/room-layout.component';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';

@Component({
    selector: 'app-synchronous-chess-page',
    templateUrl: './synchronous-chess.page.html',
    imports: [CommonModule, RoomLayoutComponent, SyncChessGameComponent, ChatComponent, WebrtcDebugComponent],
    providers: [RoomSetupService],
})
export class SynchronousChessPage implements OnInit, OnDestroy {
    public maxPlayer: number = 4;

    public room: Room<RoomMessage<ChatMessengerType, string>> | undefined = undefined;

    private readonly destroyRef = inject(DestroyRef);
    private readonly roomSetupService = inject(RoomSetupService);
    private readonly roomManagerService = inject(RoomManagerService);

    public ngOnInit(): void {
        this.roomSetupService.setup$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (setup) => {
            this.room = await this.roomManagerService.buildBlockRoom<RoomMessage<ChatMessengerType, string>>(setup, this.maxPlayer);

            this.roomSetupService.roomIsSetup(true);
        });
    }

    public ngOnDestroy(): void {
        this.room?.clear();
    }
}
