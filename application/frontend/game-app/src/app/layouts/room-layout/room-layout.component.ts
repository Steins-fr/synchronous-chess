
import { Component, inject, ChangeDetectionStrategy, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoomSetupComponent } from '@app/components/shared/room-setup/room-setup.component';
import RoomSetupService from '@app/services/room-setup/room-setup.service';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    imports: [RoomSetupComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomLayoutComponent {
    public readonly maxPlayer = input.required<number>();

    private readonly roomSetupService = inject(RoomSetupService);
    protected readonly isSetup = toSignal(this.roomSetupService.roomIsSetup$);
}
