
import { Component, DestroyRef, inject, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMessage } from '@app/services/room-manager/classes/webrtc/messages/room-message';
import { SyncChessGameComponent } from '@app/modules/chess/components/sync-chess-game/sync-chess-game.component';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { ChatComponent, ChatMessengerType } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-synchronous-chess',
    templateUrl: './synchronous-chess.html',
    imports: [RoomLayoutComponent, SyncChessGameComponent, ChatComponent, WebrtcDebugComponent],
    providers: [RoomSetupService],
})
export class SynchronousChess implements OnInit, OnDestroy {
    protected readonly maxPlayer: number = 4;

    protected room: Room<RoomMessage<ChatMessengerType, string>> | undefined = undefined;

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
