
import { Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { chessBlockChains, ChessPayloads } from '@app/modules/chess/classes/game-sessions/synchronous-chess-online-game-session';
import { SyncChessGameComponent } from '@app/modules/chess/components/sync-chess-game/sync-chess-game.component';
import { ChessPresentationComponent } from '@app/modules/chess/components/chess-presentation/chess-presentation.component';
import { ChessRulesComponent } from '@app/modules/chess/components/chess-rules/chess-rules.component';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { BlockRoom, mergeBlockChainRoutings } from '@app/services/room-manager/classes/room/block-room/block-room';
import { notifyCheatFlags } from '@app/modules/room-layout/cheat-notifications';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { chatBlockChains, ChatComponent, ChatPayloads } from '@app/modules/chat-page/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/modules/debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-synchronous-chess',
    templateUrl: './synchronous-chess.html',
    styleUrl: './synchronous-chess.scss',
    imports: [RoomLayoutComponent, SyncChessGameComponent, ChatComponent, WebrtcDebugComponent, ChessPresentationComponent, ChessRulesComponent],
    providers: [RoomSetupService, RoomManagerService],
})
export class SynchronousChess implements OnInit, OnDestroy {
    protected readonly maxPlayer: number = 4;

    protected readonly room = signal<BlockRoom<ChatPayloads & ChessPayloads> | undefined>(undefined);

    private readonly destroyRef = inject(DestroyRef);
    private readonly roomSetupService = inject(RoomSetupService);
    private readonly roomManagerService = inject(RoomManagerService);

    public constructor() {
        notifyCheatFlags(() => this.room()?.cheatFlags());
    }

    public ngOnInit(): void {
        this.roomSetupService.setup$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((setup: RoomSetupInterface) => void this.buildRoom(setup));
    }

    public ngOnDestroy(): void {
        this.room()?.clear();
    }

    private async buildRoom(setup: RoomSetupInterface): Promise<void> {
        try {
            this.room.set(await this.roomManagerService.buildBlockRoom<ChatPayloads & ChessPayloads>(setup, this.maxPlayer, mergeBlockChainRoutings(chatBlockChains, chessBlockChains)));
            this.roomSetupService.roomIsSetup(true);
        } catch {
            // Already notified: the form is available again, to try another room or name
            this.roomSetupService.roomIsSetup(false);
        }
    }
}
