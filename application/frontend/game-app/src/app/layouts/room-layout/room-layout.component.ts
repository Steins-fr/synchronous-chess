import { CommonModule } from '@angular/common';
import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoomSetupComponent } from '@app/components/shared/room-setup/room-setup.component';
import RoomSetupService from '@app/services/room-setup/room-setup.service';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    imports: [CommonModule, RoomSetupComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomLayoutComponent {
    @Input({ required: true }) public maxPlayer!: number;

    private readonly roomSetupService = inject(RoomSetupService);
    protected readonly isSetup = toSignal(this.roomSetupService.roomIsSetup$);
}
