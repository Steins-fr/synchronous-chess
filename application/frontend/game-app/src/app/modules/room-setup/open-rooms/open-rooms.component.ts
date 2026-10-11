import { Component, DOCUMENT, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { RoomGame } from '@protocol/room-game.enum';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { exhaustMap, filter, merge, Subject, switchMap, timer } from 'rxjs';

/**
 * The rooms of a game a player can join, through the socket of the page: asked again every 15 seconds while the page is
 * visible, or on demand
 */
@Component({
    selector: 'app-open-rooms',
    templateUrl: './open-rooms.component.html',
    imports: [MatButton, MatIconButton, MatIcon],
    host: {
        class: 'flex flex-col gap-2',
    },
})
export class OpenRoomsComponent {
    public static readonly REFRESH_INTERVAL: number = 15_000;

    public readonly game = input.required<RoomGame>();
    public readonly joinRoom = output<Readonly<OpenRoom>>();

    /** Undefined until the first list is received */
    protected readonly rooms = signal<ReadonlyArray<Readonly<OpenRoom>> | undefined>(undefined);
    protected readonly failed = signal<boolean>(false);

    private readonly roomSocketApi = inject(RoomSocketApi);
    private readonly document = inject(DOCUMENT);
    private readonly refreshRequests = new Subject<void>();

    public constructor() {
        toObservable(this.game).pipe(
            switchMap((game: RoomGame) => merge(
                timer(0, OpenRoomsComponent.REFRESH_INTERVAL).pipe(filter(() => !this.document.hidden)),
                this.refreshRequests,
            ).pipe(exhaustMap(() => this.load(game)))),
            takeUntilDestroyed(),
        ).subscribe();
    }

    protected refresh(): void {
        this.refreshRequests.next();
    }

    private async load(game: RoomGame): Promise<void> {
        try {
            const { rooms } = await this.roomSocketApi.send(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game });
            this.rooms.set(rooms);
            this.failed.set(false);
        } catch {
            // Logged by the socket: the next refresh may succeed
            this.failed.set(true);
        }
    }
}
