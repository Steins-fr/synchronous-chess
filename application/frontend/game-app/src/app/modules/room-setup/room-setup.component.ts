import { afterNextRender, Component, DOCUMENT, Signal, inject, input, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { storedText, storeValue } from '@app/helpers/stored-preference.helper';
import { roomInUrl, showRoomInUrl } from '@app/modules/room-layout/room-url';
import { DialogService } from '@app/services/dialog/dialog.service';
import { NotificationService } from '@app/services/notification/notification.service';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { RoomSession, RoomSessionStore } from '@app/services/room-session/room-session.store';
import RoomSetupService, { RoomSetupType } from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_ID_MAX_LENGTH } from '@protocol/room-limits';
import { map } from 'rxjs';
import { OpenRoomsComponent } from './open-rooms/open-rooms.component';
import { RoomCreate, RoomCreateDialog } from './room-create/room-create.dialog';
import { RoomJoin, RoomJoinDialog } from './room-join/room-join.dialog';
import { ServerBootingComponent } from './server-booting/server-booting.component';

/**
 * Creates a room, or joins one of the list, each through a dialog. The room in the URL of the page is resumed at once
 * with the session of the tab (a reload), else its join dialog opens: the URL of a room is an invitation
 */
@Component({
    selector: 'app-room-setup',
    templateUrl: './room-setup.component.html',
    imports: [OpenRoomsComponent, MatButtonModule, MatProgressSpinnerModule, ServerBootingComponent, TranslocoPipe],
})
export class RoomSetupComponent {
    /** The key of the local storage keeping the name typed last, given to the dialogs of every room */
    public static readonly PLAYER_NAME_KEY: string = 'player-name';
    /** How long a page resuming its room waits for its lock: the page reloaded may release it after the new one loaded */
    public static readonly LOCK_WAIT: number = 2000;

    public readonly game = input.required<RoomGame>();

    private readonly roomSetupService = inject(RoomSetupService);
    private readonly dialogService = inject(DialogService);
    private readonly notificationService = inject(NotificationService);
    private readonly roomSessions = inject(RoomSessionStore);
    private readonly router = inject(Router);
    // The window of the document, a browser one: its local storage
    private readonly window: Window = inject(DOCUMENT).defaultView as Window;
    private readonly openRooms: Signal<OpenRoomsComponent | undefined> = viewChild<OpenRoomsComponent>('openRooms');
    /** A request of the setup awaits the API, not the connection to the peers after it: long, the server boots */
    protected readonly awaitingApi: Signal<boolean> = inject(RoomSocketApi).waiting;
    protected readonly canDisplay = toSignal(this.roomSetupService.roomIsSetup$.pipe(map((roomIsSetup: boolean) => !roomIsSetup)));
    protected readonly loading = toSignal(this.roomSetupService.loading$);
    /** A room given in a dialog waits for the list to wake the database */
    protected readonly waitingServer = signal<boolean>(false);
    // Counts the rooms given in the dialogs: the last one only is set up once the list woke the database
    private roomsGiven: number = 0;

    // Given again to the dialogs, to try again once the room failed. The name typed last, in any room of any tab
    private createdRoomName: string = '';
    private playerName: string = storedText(this.window, RoomSetupComponent.PLAYER_NAME_KEY) ?? '';

    // Once the list is rendered: it wakes the database, the room waiting for it
    private readonly urlRoomOpening = afterNextRender(() => void this.openRoomOfUrl());

    /**
     * The room in the URL of the page: resumed at once with the session the tab kept of it, a reload. Else, a link
     * opened, a new tab, or a duplicated one holding a copy of the session while the first tab holds the room under its
     * name: the join dialog of the room, once a person is on the page and the list found it. Not found, ended or unknown:
     * removed from the URL, told
     */
    private async openRoomOfUrl(): Promise<void> {
        const roomId: string | null = roomInUrl(this.router);
        const openRooms: OpenRoomsComponent | undefined = this.openRooms();

        if (roomId === null || openRooms === undefined) {
            return;
        }

        const session: Readonly<RoomSession> | undefined = this.roomSessions.get(roomId);
        if (session !== undefined && await this.roomSetupService.holdLock(roomId, session.playerName, RoomSetupComponent.LOCK_WAIT)) {
            await this.setUpOnceReady(openRooms, 'resume', roomId, session.playerName, undefined, session.token);
            return;
        }

        if (!await openRooms.whenServerReady()) {
            return;
        }

        const room: Readonly<OpenRoom> | undefined = roomId.length <= ROOM_ID_MAX_LENGTH ? await openRooms.findRoom(roomId) : undefined;
        // Not once the list was removed meanwhile: a room of the list joined, or the page closed
        if (this.openRooms() !== openRooms) {
            return;
        }

        if (room === undefined) {
            this.notificationService.error({ key: marker('rooms.notifications.roomGone') });
            this.roomSessions.remove(roomId);
            showRoomInUrl(this.router, null);
            return;
        }

        await this.joinOpenRoom(room, openRooms);
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
    private async setUpOnceReady(
        openRooms: OpenRoomsComponent,
        type: RoomSetupType,
        roomName: string,
        playerName: string,
        password?: string,
        token?: string,
    ): Promise<void> {
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
            this.setUp(type, roomName, playerName, password, token);
        }
    }

    /** @param token kept in the session of a room resumed, drawn for a room created or joined */
    private setUp(type: RoomSetupType, roomName: string, playerName: string, password?: string, token: string = CryptoHelper.randomHex(32)): void {
        this.playerName = playerName;
        storeValue(this.window, RoomSetupComponent.PLAYER_NAME_KEY, playerName);
        this.roomSetupService.setup({ type, game: this.game(), roomName, playerName, password, token });
    }
}
