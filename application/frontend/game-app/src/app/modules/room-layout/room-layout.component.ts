
import { Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoomSetupComponent } from '@app/modules/room-setup/room-setup.component';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';

@Component({
    selector: 'app-room-layout',
    templateUrl: './room-layout.component.html',
    styleUrls: ['./room-layout.component.scss'],
    imports: [RoomSetupComponent],
})
export class RoomLayoutComponent {
    /** The game of the page: its rooms are listed, created and joined */
    public readonly game = input.required<RoomGame>();
    /** Whether the content is dimmed until the room is set up, as a preview of the page */
    public readonly dimContent = input<boolean>(true);

    private readonly roomSetupService = inject(RoomSetupService);
    protected readonly isSetup = toSignal(this.roomSetupService.roomIsSetup$);
}
