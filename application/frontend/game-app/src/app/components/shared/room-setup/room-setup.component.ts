import { CommonModule } from '@angular/common';
import { Component, OnInit, Input, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { BlockRoomService } from '@app/services/room/block-room/block-room.service';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    styleUrls: ['./room-setup.component.scss'],
    standalone: true,
    imports: [CommonModule, MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule, MatProgressSpinnerModule],
}) export class RoomSetupComponent implements OnInit {

    private static readonly JOINING_ERROR: string = 'La salle est pleine ou elle n\'existe plus.';
    private static readonly CREATING_ERROR: string = 'La salle existe déjà.';

    @Input({ required: true }) public maxPlayer!: number;

    public roomName: string = '';
    public playerName: string = '';
    public isLoading: boolean = false;
    public error: string = '';

    private readonly roomService = inject(BlockRoomService<never>);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);

    public ngOnInit(): void {
        this.roomService.setup();
        this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params: ParamMap) => {
            if(params.has('auto-create')) {
                this.roomName = params.get('room') ?? 'test';
                this.playerName = `${Math.floor(Math.random() * 100000)}`;
                this.enterRoom(true);
            } else if (params.has('auto-join')) {
                this.roomName = params.get('room') ?? 'test';
                this.playerName = `${Math.floor(Math.random() * 100000)}`;
                setTimeout(() => this.enterRoom(false), 1000);
            }
        });
    }

    protected get canDisplay(): boolean {
        return !this.roomService.roomIsSetup();
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
