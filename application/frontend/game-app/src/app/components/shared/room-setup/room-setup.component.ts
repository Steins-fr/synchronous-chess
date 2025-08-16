import { Component, OnInit, Input } from '@angular/core';
import { BlockRoomService } from '../../../services/room/block-room/block-room.service';
import { ActivatedRoute, ParamMap } from '@angular/router';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    styleUrls: ['./room-setup.component.scss']
}) export class RoomSetupComponent implements OnInit {

    private static readonly JOINING_ERROR: string = 'La salle est pleine ou elle n\'existe plus.';
    private static readonly CREATING_ERROR: string = 'La salle existe déjà.';

    @Input() private readonly maxPlayer: number;
    public roomName: string;
    public playerName: string;
    public isLoading: boolean = false;
    public error: string = '';

    public constructor(
        public roomService: BlockRoomService,
        private route: ActivatedRoute
    ) { }

    public ngOnInit(): void {
        this.roomService.setup();
        this.route.queryParamMap.subscribe((params: ParamMap) => {
            if(params.has('auto-create')) {
                this.roomName = 'test';
                this.playerName = `${Math.floor(Math.random() * 100000)}`;
                this.enterRoom(true);
            } else if (params.has('auto-join')) {
                this.roomName = 'test';
                this.playerName = `${Math.floor(Math.random() * 100000)}`;
                setTimeout(() => this.enterRoom(false), 1000);
            }
        });
    }

    public hostRoom(): void {
        this.enterRoom(true);
    }

    private enterRoom(isHost: boolean): void {
        this.error = '';
        if (isHost) {
            this.isLoading = true;
            this.roomService.createRoom(this.roomName, this.playerName, this.maxPlayer)
                .then(() => this.isLoading = false)
                .catch(() => {
                    this.isLoading = false;
                    this.error = RoomSetupComponent.CREATING_ERROR;
                });
        } else {
            this.isLoading = true;
            this.roomService.joinRoom(this.roomName, this.playerName)
                .then(() => this.isLoading = false)
                .catch(() => {
                    this.isLoading = false;
                    this.error = RoomSetupComponent.JOINING_ERROR;
                });
        }
    }

    public joinRoom(): void {
        this.enterRoom(false);
    }
}
