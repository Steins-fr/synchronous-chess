import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { WebrtcStatesComponent } from '@app/components/shared/debug/webrtc-states/webrtc-states.component';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';
import { RoomService } from '@app/services/room/room.service';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html',
    standalone: true,
    imports: [CommonModule, WebrtcStatesComponent],
})
export class WebrtcDebugComponent {
    protected readonly roomService: RoomService<any> = inject(BlockRoomService);
}
