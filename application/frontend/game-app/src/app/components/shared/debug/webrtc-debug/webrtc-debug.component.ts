import { Component } from '@angular/core';
import { RoomService } from '../../../../services/room/room.service';

@Component({
    selector: 'app-debug-webrtc',
    templateUrl: './webrtc-debug.component.html'
})
export class WebrtcDebugComponent {

    public constructor(public readonly roomService: RoomService) { }

}
