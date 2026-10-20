import { Component, OnInit, Signal, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { DialogService } from '@app/services/dialog/dialog.service';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomSetupService, { RoomSetupType } from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { map } from 'rxjs';
import { OpenRoomsComponent } from './open-rooms/open-rooms.component';
import { RoomCreate, RoomCreateDialog } from './room-create/room-create.dialog';
import { RoomJoin, RoomJoinDialog } from './room-join/room-join.dialog';
import { ServerBootingComponent } from './server-booting/server-booting.component';

/** Creates a room, or joins one of the list, each through a dialog */
@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [OpenRoomsComponent, MatButtonModule, MatProgressSpinnerModule, ServerBootingComponent, TranslocoPipe],
})
export class RoomSetupComponent implements OnInit {
    public readonly game = input.required<RoomGame>();

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly route = inject(ActivatedRoute);
    private readonly dialogService = inject(DialogService);
    /** A request of the setup awaits the API, not the connection to the peers after it: long, the server boots */
    protected readonly awaitingApi: Signal<boolean> = inject(RoomSocketApi).waiting;
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);
    /** A room given in a dialog waits for the list to wake the database */
    protected readonly waitingServer = signal<boolean>(false);
    // Counts the rooms given in the dialogs: the last one only is set up once the list woke the database
    private roomsGiven: number = 0;

    // Given again to the dialogs, to try again once the room failed
    private createdRoomName: string = '';
    private playerName: string = '';

    /**
     * The links of development set the room up at once, without waiting for a person on the page: linked from no page, a
     * bot never finds them. The tab joining waits a while for the tab creating the room, both opened together
     */
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

    /** @param openRooms the list, which wakes the database: a room created once it answered meets it awake */
    protected async createRoom(openRooms: OpenRoomsComponent): Promise<void> {
        const room: RoomCreate | void = await this.dialogService.open(RoomCreateDialog, {
            title: marker('rooms.create.title'),
            inputs: { roomName: this.createdRoomName, playerName: this.playerName },
        });

        // Not once the dialog is closed
        if (!room) {
            return;
        }

        this.createdRoomName = room.roomName;
        await this.setUpOnceReady(openRooms, 'create', room.roomName, room.playerName, room.password);
    }

    /**
     * Joins a room of the list under the name asked, with the password of a private one
     * @param openRooms the list, which wakes the database: the list shown may be asked again meanwhile
     */
    protected async joinOpenRoom(room: Readonly<OpenRoom>, openRooms: OpenRoomsComponent): Promise<void> {
        const join: RoomJoin | void = await this.dialogService.open(RoomJoinDialog, {
            title: marker('rooms.join.title'),
            inputs: { roomName: room.roomName, isPrivate: room.isPrivate, playerName: this.playerName },
        });

        if (join) {
            await this.setUpOnceReady(openRooms, 'join', room.roomName, join.playerName, join.password);
        }
    }

    /**
     * Not before the list, asked at the first gesture of the person, woke the database: the request would meet it asleep,
     * its lambda giving up before a deep sleep ends. The page tells the server boots meanwhile. The room given last only:
     * a room joined while the room created waits replaces it
     */
    private async setUpOnceReady(openRooms: OpenRoomsComponent, type: RoomSetupType, roomName: string, playerName: string, password?: string): Promise<void> {
        this.roomsGiven++;
        const given: number = this.roomsGiven;
        this.waitingServer.set(true);
        const ready: boolean = await openRooms.whenServerReady();

        // Not once another room was given meanwhile
        if (given !== this.roomsGiven) {
            return;
        }

        this.waitingServer.set(false);
        // Not once the list was removed meanwhile: the page closed
        if (ready) {
            this.setUp(type, roomName, playerName, password);
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
