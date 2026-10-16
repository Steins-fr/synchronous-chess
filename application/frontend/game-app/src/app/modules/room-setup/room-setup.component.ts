import { Component, OnInit, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { DialogService } from '@app/services/dialog/dialog.service';
import RoomSetupService, { RoomSetupType } from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { map } from 'rxjs';
import { OpenRoomsComponent } from './open-rooms/open-rooms.component';
import { RoomCreate, RoomCreateDialog } from './room-create/room-create.dialog';
import { RoomJoin, RoomJoinDialog } from './room-join/room-join.dialog';

/** Creates a room, or joins one of the list, each through a dialog */
@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [OpenRoomsComponent, MatButtonModule, MatProgressSpinnerModule],
})
export class RoomSetupComponent implements OnInit {
    public readonly game = input.required<RoomGame>();

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    private readonly dialogService = inject(DialogService);
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);

    // Given again to the dialogs, to try again once the room failed
    private createdRoomName: string = '';
    private playerName: string = '';

    public ngOnInit(): void {
        const params = this.route.snapshot.queryParamMap;
        if (params.has('auto-create')) {
            this.setUp('create', this.linkRoom(params), this.randomPlayerName());
        } else if (params.has('auto-join')) {
            const roomName: string = this.linkRoom(params);
            const playerName: string = this.randomPlayerName();
            setTimeout(() => this.setUp('join', roomName, playerName), 1000);
        }
    }

    protected async createRoom(): Promise<void> {
        const room: RoomCreate | void = await this.dialogService.open(RoomCreateDialog, {
            title: 'Créer une salle',
            inputs: { roomName: this.createdRoomName, playerName: this.playerName },
        });

        // Not once the dialog is closed
        if (room) {
            this.createdRoomName = room.roomName;
            this.setUp('create', room.roomName, room.playerName, room.password);
        }
    }

    /** Joins a room of the list under the name asked, with the password of a private one */
    protected async joinOpenRoom(room: Readonly<OpenRoom>): Promise<void> {
        const join: RoomJoin | void = await this.dialogService.open(RoomJoinDialog, {
            title: 'Rejoindre la salle',
            inputs: { roomName: room.roomName, isPrivate: room.isPrivate, playerName: this.playerName },
        });

        if (join) {
            this.setUp('join', room.roomName, join.playerName, join.password);
        }
    }

    private setUp(type: RoomSetupType, roomName: string, playerName: string, password?: string): void {
        this.playerName = playerName;
        this.roomSetupService.setup({ type, game: this.game(), roomName, playerName, password });
    }

    // The room of an auto link: the default one when the link gives none, or an empty one
    private linkRoom(params: ParamMap): string {
        const room: string = params.get('room') ?? '';
        return room === '' ? 'test' : room;
    }

    private randomPlayerName(): string {
        return `${ CryptoHelper.randomNumber(100_000, 999_999) }`;
    }
}
