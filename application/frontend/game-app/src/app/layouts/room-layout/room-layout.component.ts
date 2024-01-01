import { CommonModule } from '@angular/common';
import { Component, Input, booleanAttribute, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { WebrtcDebugComponent } from '@app/components/shared/debug/webrtc-debug/webrtc-debug.component';
import { RoomSetupComponent } from '@app/components/shared/room-setup/room-setup.component';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    standalone: true,
    imports: [CommonModule, RoomSetupComponent, WebrtcDebugComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomLayoutComponent implements OnDestroy {
    @Input({ required: true }) public maxPlayer!: number;
    @Input({ transform: booleanAttribute }) public isDebugging: boolean = false;

    private readonly roomService = inject(BlockRoomService);
    protected readonly isActive = toSignal(this.roomService.isActive);

    public ngOnDestroy(): void {
        this.roomService.clear();
    }
}
