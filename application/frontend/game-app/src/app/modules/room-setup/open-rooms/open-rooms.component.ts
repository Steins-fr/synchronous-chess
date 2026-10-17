import { HttpResourceRef } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, Resource, Signal, signal, untracked } from '@angular/core';
import { form, maxLength, schema } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { debouncedSignal, lastDefinedSignal, withPreviousValue } from '@app/helpers/signal.helper';
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


const roomSearchSchema = schema<RoomSearch>((path) => {
    maxLength(path.text, ROOM_SEARCH_MAX_LENGTH, { message: `La recherche fait ${ ROOM_SEARCH_MAX_LENGTH } caractères au plus` });
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

    protected readonly search = signal<Readonly<RoomSearch>>({ text: '' });
    protected readonly searchForm = form(this.search, roomSearchSchema, { name: 'room-search' });

    private readonly pageVisibility = inject(PageVisibilityService);

    /** The search asked: at once the first one, then once the player stops typing */
    private readonly query: Signal<string> = debouncedSignal(computed(() => this.search().text.trim()), OpenRoomsComponent.SEARCH_DELAY);

    /** The rooms of the game matching the search, asked again by refresh() */
    private readonly roomsResource: HttpResourceRef<RoomsResponse | undefined> = openRoomsResource(() => {
        const search: string = this.query();

        // A search too long is refused by the API: not asked, the list keeps the last one
        if (search.length > ROOM_SEARCH_MAX_LENGTH) {
            return undefined;
        }

        return { game: this.game(), search: search === '' ? undefined : search };
    });

    /** The rooms shown: the list of a former search kept until the new one is answered, none once the list failed */
    protected readonly rooms: Resource<RoomsResponse | undefined> = withPreviousValue(this.roomsResource);
    /** The search the list shows: the one asked when the list was last received. Undefined until the first one */
    protected readonly searched: Signal<string | undefined> = lastDefinedSignal(() => this.rooms.status() === 'resolved' ? this.query() : undefined);

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
