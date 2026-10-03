
import { Component, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomLayoutComponent } from '@app/modules/room-layout/room-layout.component';
import { BlockRoom } from '@app/services/room-manager/classes/room/block-room/block-room';
import { notifyCheatFlags } from '../room-layout/cheat-notifications';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService, { RoomSetupInterface } from '@app/services/room-setup/room-setup.service';
import { chatBlockChains, ChatComponent, ChatPayloads } from './components/chat/chat.component';
import { WebrtcDebugComponent } from '../debug/webrtc-debug/webrtc-debug.component';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat.page.html',
    imports: [RoomLayoutComponent, ChatComponent, WebrtcDebugComponent],
    providers: [RoomSetupService, RoomManagerService],
})
export class ChatPage implements OnInit, OnDestroy {
    public maxPlayer: number = 6;
    public readonly room = signal<BlockRoom<ChatPayloads> | undefined>(undefined);

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
            this.room.set(await this.roomManagerService.buildBlockRoom<ChatPayloads>(setup, this.maxPlayer, chatBlockChains));
            this.roomSetupService.roomIsSetup(true);
        } catch {
            // Already notified: the form is available again, to try another room or name
            this.roomSetupService.roomIsSetup(false);
        }
    }
}
