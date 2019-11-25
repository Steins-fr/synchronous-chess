import { Component, Input } from '@angular/core';
import { RoomService } from '../../services/room/room.service';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss']
})
export class RoomLayoutComponent {
    @Input() public maxPlayer: number;
    @Input() public isDebugging: boolean = false;

    public constructor(public roomService: RoomService) { }
}
