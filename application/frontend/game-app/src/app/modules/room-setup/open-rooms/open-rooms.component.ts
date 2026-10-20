import { HttpResourceRef } from '@angular/common/http';
import { Component, computed, debounced, effect, inject, input, linkedSignal, output, Resource, ResourceSnapshot, Signal, signal, untracked } from '@angular/core';
import { form, maxLength, schema } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { withPreviousValue } from '@app/helpers/signal.helper';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { openRoomsResource } from '@app/services/room-api/room-http.api';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_SEARCH_MAX_LENGTH } from '@protocol/room-limits';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';

// The model of the search of the rooms
type RoomSearch = {
    text: string;
};

/** The rooms matching a search, with the search they answer */
type RoomsList = {
    readonly rooms: ReadonlyArray<Readonly<OpenRoom>>;
    /** More rooms match than the ones listed */
    readonly hasMore: boolean;
    readonly search: string;
};


const roomSearchSchema = schema<RoomSearch>((path) => {
    maxLength(path.text, ROOM_SEARCH_MAX_LENGTH, { message: marker('rooms.open.search.maxLength') });
});

/**
 * The rooms of a game, searched by a part of their name, through the HTTP API: the page opens its socket once a room
 * is created or joined only.
 * Without search, asked again every 15 seconds while the page is visible, and once it is visible again; a search is
 * asked once typed. Asked again on demand too
 */
@Component({
    selector: 'app-open-rooms',
    templateUrl: './open-rooms.component.html',
    imports: [MatButton, MatIconButton, MatIcon, TextFieldComponent, TranslocoDirective],
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

    protected readonly search = signal<Readonly<RoomSearch>>({ text: '' });
    protected readonly searchForm = form(this.search, roomSearchSchema, { name: 'room-search' });

    private readonly pageVisibility = inject(PageVisibilityService);

    /**
     * The search asked: at once the first one, then once the player stops typing. A search too long is refused by the
     * API: not asked, the last search asked kept, its list still awaited or refreshed
     */
    private readonly query: Signal<string> = linkedSignal<string, string>({
        // The value of the search typed last, kept until the player stops typing
        source: debounced(computed(() => this.search().text.trim()), OpenRoomsComponent.SEARCH_DELAY).value,
        computation: (text: string, previous?: { value: string }) => text.length > ROOM_SEARCH_MAX_LENGTH && previous !== undefined ? previous.value : text,
    });

    /** The rooms of the game matching the search, asked again by refresh() */
    private readonly roomsResource: HttpResourceRef<RoomsResponse | undefined> = openRoomsResource(() => ({
        game: this.game(),
        search: this.query() === '' ? undefined : this.query(),
    }));

    /**
     * The state of the resource, its list with the search it answers: the search asked, whenever the resource has a
     * value, a new search resetting it while it loads
     */
    private readonly listSnapshot: Signal<ResourceSnapshot<RoomsList | undefined>> = computed((): ResourceSnapshot<RoomsList | undefined> => {
        const snapshot: ResourceSnapshot<RoomsResponse | undefined> = this.roomsResource.snapshot();

        if (snapshot.status === 'error') {
            return snapshot;
        }

        return { status: snapshot.status, value: snapshot.value && { ...snapshot.value, search: this.query() } };
    });

    /** The rooms shown, with their search: the list of a former search kept until the new one is answered, none once the list failed */
    protected readonly rooms: Resource<RoomsList | undefined> = withPreviousValue({ snapshot: this.listSnapshot });

    public constructor() {
        effect((onCleanup: (cleanup: () => void) => void) => {
            // Restarted by a change of the game or of the search. A search is a query of its own, not repeated; a page
            // hidden asks nothing
            this.game();
            if (this.query() !== '' || !this.pageVisibility.visible()) {
                return;
            }

            // Visible again: at once. The first list, and the one of a new search or game, are asked by the resource,
            // which ignores a refresh meanwhile
            untracked(() => this.refresh());
            const timer: ReturnType<typeof setInterval> = setInterval(() => this.refresh(), OpenRoomsComponent.REFRESH_INTERVAL);
            onCleanup(() => clearInterval(timer));
        });
    }

    /** Not again while a list is awaited: the resource reloads once loaded only */
    protected refresh(): void {
        this.roomsResource.reload();
    }

    protected isFull(room: Readonly<OpenRoom>): boolean {
        return room.playerCount >= room.maxPlayer;
    }
}
