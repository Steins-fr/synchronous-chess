import { Component, computed, DOCUMENT, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { form, maxLength, schema } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_SEARCH_MAX_LENGTH } from '@protocol/room-limits';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { combineLatest, debounceTime, distinctUntilChanged, exhaustMap, filter, fromEvent, merge, skip, Subject, switchMap, take, timer } from 'rxjs';

// The model of the search of the rooms
type RoomSearch = {
    text: string;
};

const roomSearchSchema = schema<RoomSearch>((path) => {
    maxLength(path.text, ROOM_SEARCH_MAX_LENGTH, { message: `La recherche fait ${ ROOM_SEARCH_MAX_LENGTH } caractères au plus` });
});

/**
 * The rooms of a game, searched by the name of the room or of its host, through the socket of the page: asked again
 * every 15 seconds while the page is visible, once it is visible again, or on demand
 */
@Component({
    selector: 'app-open-rooms',
    templateUrl: './open-rooms.component.html',
    imports: [MatButton, MatIconButton, MatIcon, TextFieldComponent],
    host: {
        class: 'flex flex-col gap-2',
    },
})
export class OpenRoomsComponent {
    public static readonly REFRESH_INTERVAL: number = 15_000;
    /** The search waits for the player to stop typing */
    public static readonly SEARCH_DELAY: number = 300;

    public readonly game = input.required<RoomGame>();
    public readonly joinRoom = output<Readonly<OpenRoom>>();

    /** Undefined until the first list is received */
    protected readonly rooms = signal<ReadonlyArray<Readonly<OpenRoom>> | undefined>(undefined);
    /** More rooms match than the ones listed */
    protected readonly hasMore = signal<boolean>(false);
    protected readonly failed = signal<boolean>(false);

    protected readonly search = signal<RoomSearch>({ text: '' });
    protected readonly searchForm = form(this.search, roomSearchSchema, { name: 'room-search' });
    /** The search the list shows */
    protected readonly searched = signal<string>('');

    private readonly roomSocketApi = inject(RoomSocketApi);
    private readonly document = inject(DOCUMENT);
    private readonly refreshRequests = new Subject<void>();

    public constructor() {
        const text$ = toObservable(computed(() => this.search().text.trim()));
        // The first list at once, the searches once the player stops typing
        const search$ = merge(text$.pipe(take(1)), text$.pipe(skip(1), debounceTime(OpenRoomsComponent.SEARCH_DELAY))).pipe(
            // A search too long is refused by the API: the list keeps the last one
            filter((text: string) => text.length <= ROOM_SEARCH_MAX_LENGTH),
            distinctUntilChanged(),
        );
        const visible$ = fromEvent(this.document, 'visibilitychange').pipe(filter(() => !this.document.hidden));

        combineLatest([toObservable(this.game), search$]).pipe(
            switchMap(([game, search]: [RoomGame, string]) => merge(
                // The first list even in a hidden page: it is shown once visible
                timer(0, OpenRoomsComponent.REFRESH_INTERVAL).pipe(filter((tick: number) => tick === 0 || !this.document.hidden)),
                visible$,
                this.refreshRequests,
            ).pipe(exhaustMap(() => this.load(game, search)))),
            takeUntilDestroyed(),
        ).subscribe();
    }

    protected refresh(): void {
        this.refreshRequests.next();
    }

    protected isFull(room: Readonly<OpenRoom>): boolean {
        return room.playerCount >= room.maxPlayer;
    }

    private async load(game: RoomGame, search: string): Promise<void> {
        try {
            const { rooms, hasMore } = await this.roomSocketApi.send(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game, search: search === '' ? undefined : search });
            this.rooms.set(rooms);
            this.hasMore.set(hasMore);
            this.searched.set(search);
            this.failed.set(false);
        } catch {
            // Logged by the socket: the next refresh may succeed
            this.failed.set(true);
        }
    }
}
