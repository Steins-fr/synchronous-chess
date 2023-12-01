import { CommonModule } from '@angular/common';
import { Component, Input, booleanAttribute } from '@angular/core';
import { WebrtcDebugComponent } from '@app/components/shared/debug/webrtc-debug/webrtc-debug.component';
import { RoomSetupComponent } from '@app/components/shared/room-setup/room-setup.component';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    standalone: true,
    imports: [CommonModule, RoomSetupComponent, WebrtcDebugComponent],
})
export class RoomLayoutComponent {
    @Input({ required: true }) public maxPlayer!: number;
    @Input({ transform: booleanAttribute }) public isDebugging: boolean = false;

    public constructor(private readonly roomService: BlockRoomService<never>) { }

    public get isActive$(): Observable<boolean> {
        return this.roomService.isActive;
    }
}
