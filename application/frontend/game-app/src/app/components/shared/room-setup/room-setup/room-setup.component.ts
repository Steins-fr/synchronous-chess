import { Component, OnInit, Input } from '@angular/core';
import { RoomService } from 'src/app/services/room/room.service';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    styleUrls: ['./room-setup.component.scss']
})
export class RoomSetupComponent implements OnInit {

    @Input() private readonly maxPlayer: number;
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
        if (isHost) {
            this.roomService.createRoom(this.roomName, this.playerName, this.maxPlayer);
        } else {
            this.roomService.joinRoom(this.roomName, this.playerName);
        }
    }

    public joinRoom(): void {
        this.enterRoom(false);
    }
}
