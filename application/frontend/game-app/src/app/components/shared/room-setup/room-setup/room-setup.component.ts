import { Component, OnInit } from '@angular/core';
import { RoomService } from 'src/app/services/room/room.service';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    styleUrls: ['./room-setup.component.scss']
})
export class RoomSetupComponent implements OnInit {

    public roomName: string;
    public playerName: string;

    public constructor(public roomService: RoomService) { }

    public ngOnInit(): void {
        this.roomService.setup();
    }

    public hostRoom(): void {
        this.enterRoom(true);
    }

    private enterRoom(isHost: boolean): void {
        this.roomService.enterRoom(isHost, this.roomName, this.playerName);
    }

    public joinRoom(): void {
        this.enterRoom(false);
    }
}
