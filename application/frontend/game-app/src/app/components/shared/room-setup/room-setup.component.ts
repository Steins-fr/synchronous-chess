import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, DestroyRef, input } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { map } from 'rxjs';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [CommonModule, MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule, MatProgressSpinnerModule],
})
export class RoomSetupComponent implements OnInit {

    public readonly maxPlayer = input.required<number>();

    public roomName: string = '';
    public playerName: string = '';

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    private readonly destroyRef = inject(DestroyRef);
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);

    public ngOnInit(): void {
        this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params: ParamMap) => {
            if (params.has('auto-create')) {
                this.roomName = params.get('room') ?? 'test';
                this.playerName = `${ Math.floor(Math.random() * 100000) }`;
                this.hostRoom();
            } else if (params.has('auto-join')) {
                this.roomName = params.get('room') ?? 'test';
                this.playerName = `${ Math.floor(Math.random() * 100000) }`;
                setTimeout(() => this.joinRoom(), 1000);
            }
        });
    }

    public async hostRoom(): Promise<void> {
        this.roomSetupService.setup('create', this.roomName, this.playerName);
    }

    public async joinRoom(): Promise<void> {
        this.roomSetupService.setup('join', this.roomName, this.playerName);
    }
}
