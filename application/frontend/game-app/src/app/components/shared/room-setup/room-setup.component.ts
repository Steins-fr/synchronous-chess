
import { Component, OnInit, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { map } from 'rxjs';

@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [MatFormFieldModule, MatInputModule, FormsModule, MatButtonModule, MatProgressSpinnerModule],
})
export class RoomSetupComponent implements OnInit {
    public readonly maxPlayer = input.required<number>();

    protected roomName: string = '';
    protected playerName: string = '';

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);

    public ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        if (params.has('auto-create')) {
            this.roomName = params.get('room') ?? 'test';
            this.playerName = `${ CryptoHelper.randomNumber(100000, 999999) }`;
            this.hostRoom();
        } else if (params.has('auto-join')) {
            this.roomName = params.get('room') ?? 'test';
            this.playerName = `${ CryptoHelper.randomNumber(100000, 999999) }`;
            setTimeout(() => this.joinRoom(), 1000);
        }
    }

    protected async hostRoom(): Promise<void> {
        this.roomSetupService.setup('create', this.roomName, this.playerName);
    }

    protected async joinRoom(): Promise<void> {
        this.roomSetupService.setup('join', this.roomName, this.playerName);
    }
}
