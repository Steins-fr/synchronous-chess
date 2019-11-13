import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html'
})
export class RoomLayoutComponent {
    @Input() public maxPlayer: number;
    @Input() public isDebugging: boolean = false;
}
