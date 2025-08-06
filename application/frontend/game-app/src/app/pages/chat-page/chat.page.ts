
import { Component, inject, OnInit, DestroyRef, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RoomMessage } from '@app/classes/webrtc/messages/room-message';
import { ChatComponent, ChatMessengerType } from '@app/components/chat/chat.component';
import { WebrtcDebugComponent } from '@app/components/shared/debug/webrtc-debug/webrtc-debug.component';
import { RoomLayoutComponent } from '@app/layouts/room-layout/room-layout.component';
import { Room } from '@app/services/room-manager/classes/room/room';
import RoomManagerService from '@app/services/room-manager/room-manager.service';
import RoomSetupService from '@app/services/room-setup/room-setup.service';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat.page.html',
    imports: [RoomLayoutComponent, ChatComponent, WebrtcDebugComponent],
    providers: [RoomSetupService],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPage implements OnInit, OnDestroy {
    public maxPlayer: number = 6;
    public readonly room = signal<Room<RoomMessage<ChatMessengerType, string>> | undefined>(undefined);

    private readonly destroyRef = inject(DestroyRef);
    private readonly roomSetupService = inject(RoomSetupService);
    private readonly roomManagerService = inject(RoomManagerService);

    public ngOnInit(): void {
        this.roomSetupService.setup$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async (setup) => {
            this.room.set(await this.roomManagerService.buildBlockRoom<RoomMessage<ChatMessengerType, string>>(setup, this.maxPlayer));

            this.roomSetupService.roomIsSetup(true);
        });
    }

    public ngOnDestroy(): void {
        this.room()?.clear();
    }
}
