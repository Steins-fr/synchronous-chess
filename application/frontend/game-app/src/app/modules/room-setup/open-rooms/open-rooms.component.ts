import { HttpErrorResponse, HttpResourceRef } from '@angular/common/http';
import { Component, computed, debounced, effect, inject, input, linkedSignal, output, Resource, ResourceSnapshot, Signal, signal, untracked, WritableSignal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { form, maxLength, schema } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import { marker } from '@jsverse/transloco-keys-manager/marker';
import { withPreviousValue } from '@app/helpers/signal.helper';
import { TextFieldComponent } from '@app/modules/form/text-field/text-field.component';
import { ServerBootingComponent } from '@app/modules/room-setup/server-booting/server-booting.component';
import { PageVisibilityService } from '@app/services/page-visibility/page-visibility.service';
import { openRoomsResource } from '@app/services/room-api/room-http.api';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
import { RoomGame } from '@protocol/room-game.enum';
import { ROOM_SEARCH_MAX_LENGTH } from '@protocol/room-limits';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { filter, firstValueFrom, Observable } from 'rxjs';

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


/**
 * The list failed by the network or the server: the paused database may still resume, a deep sleep outlasting the
 * retries of the lambda
 */
function isServerFailure(error: unknown): boolean {
    return error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
}

/** The count of the failures by the server before the first list */
const NO_FAILURE: Readonly<{ value: number }> = { value: 0 };

const roomSearchSchema = schema<RoomSearch>((path) => {
    maxLength(path.text, ROOM_SEARCH_MAX_LENGTH, { message: marker('rooms.open.search.maxLength') });
});

/**
 * The rooms of a game, searched by a part of their name, through the HTTP API: the page opens its socket once a room
 * is created or joined only.
 * Asked once a person is on the page, never for a bot rendering it, which would wake the paused database
 * (VisitorPresenceService): a button asks them meanwhile. Then, without search, asked again every 15 seconds while the
 * page is visible, and once it is visible again; a search is asked once typed. Asked again on demand too
 */
@Component({
    selector: 'app-open-rooms',
    templateUrl: './open-rooms.component.html',
    imports: [MatButton, MatIconButton, MatIcon, ServerBootingComponent, TextFieldComponent, TranslocoDirective],
    host: {
        class: 'flex flex-col gap-2',
    },
})
export class OpenRoomsComponent {
    public static readonly REFRESH_INTERVAL: number = 15_000;
    /** How long a list failed by the server waits before it is asked again, in milliseconds */
    public static readonly RETRY_DELAY: number = 2000;
    /**
     * How many times a list failed by the server in a row is asked again, before it tells it failed: a deep sleep of the
     * database fails the first request only, its lambda giving up before the database resumes
     */
    public static readonly MAX_RETRIES: number = 5;
    /** The search waits for the player to stop typing */
    public static readonly SEARCH_DELAY: number = 300;

    public readonly game = input.required<RoomGame>();
    public readonly joinRoom = output<Readonly<OpenRoom>>();

    protected readonly search = signal<Readonly<RoomSearch>>({ text: '' });
    protected readonly searchForm = form(this.search, roomSearchSchema, { name: 'room-search' });

    private readonly pageVisibility = inject(PageVisibilityService);
    private readonly visitorPresence = inject(VisitorPresenceService);

    /** A person is on the page: the rooms are asked */
    protected readonly visitorPresent: Signal<boolean> = this.visitorPresence.present;

    /**
     * The search asked: at once the first one, then once the player stops typing. A search too long is refused by the
     * API: not asked, the last search asked kept, its list still awaited or refreshed
     */
    private readonly query: Signal<string> = linkedSignal<string, string>({
        // The value of the search typed last, kept until the player stops typing
        source: debounced(computed(() => this.search().text.trim()), OpenRoomsComponent.SEARCH_DELAY).value,
        computation: (text: string, previous?: { value: string }) => text.length > ROOM_SEARCH_MAX_LENGTH && previous !== undefined ? previous.value : text,
    });

    /** The rooms of the game matching the search, once a person is on the page, asked again by refresh() */
    private readonly roomsResource: HttpResourceRef<RoomsResponse | undefined> = openRoomsResource(() => this.visitorPresent() ? {
        game: this.game(),
        search: this.query() === '' ? undefined : this.query(),
    } : undefined);

    /**
     * The failures of the list by the server in a row: one more at each, a reload keeping the error of the former one
     * meanwhile. None once a list answers or another one is asked, or once asked again by the person
     */
    private readonly serverFailures: WritableSignal<number> = linkedSignal<unknown, number>({
        source: () => this.roomsResource.error(),
        computation: (error: unknown, previous: Readonly<{ value: number }> = NO_FAILURE) => isServerFailure(error) ? previous.value + 1 : 0,
    });

    /**
     * The list failed by the server, asked again soon: the server still boots. Told failed after MAX_RETRIES: offline,
     * refused (a page of another origin reads no response) or failing
     */
    private readonly failedByServer: Signal<boolean> = computed(() => this.serverFailures() > 0 && this.serverFailures() <= OpenRoomsComponent.MAX_RETRIES);

    /**
     * No list shown and one awaited, or asked again after a failure by the server: long, the server boots. Not the refresh
     * of a list shown, slow on a slow network, or failed once only: a page asking it every 15 seconds keeps the server
     * awake
     */
    public readonly awaitingServer: Signal<boolean> = computed(() => this.rooms.isLoading() && !this.rooms.hasValue());

    /**
     * The list answered, or failed otherwise than by the server booting: the database it woke is awake, a room created
     * then does not meet it asleep (RoomSetupComponent). Not before a person is on the page (nothing asked yet), nor while
     * a list is asked, a list shown included: back to a page hidden for a day, its refresh wakes the database from its deep
     * sleep
     */
    public readonly serverReady: Signal<boolean> = computed(() => this.visitorPresent() && !this.failedByServer() && !this.roomsResource.isLoading());
    // Completed once the list is destroyed, its resource then idle: not ready
    private readonly serverReady$: Observable<boolean> = toObservable(this.serverReady);

    /**
     * The state of the resource, its list with the search it answers: the search asked, whenever the resource has a
     * value, a new search resetting it while it loads. Failed by the server, the list is asked again soon: loading, the
     * list shown kept meanwhile
     */
    private readonly listSnapshot: Signal<ResourceSnapshot<RoomsList | undefined>> = computed((): ResourceSnapshot<RoomsList | undefined> => {
        const snapshot: ResourceSnapshot<RoomsResponse | undefined> = this.roomsResource.snapshot();

        // Failed, or reloaded after the failure, which keeps its error meanwhile
        if (this.failedByServer()) {
            return { status: 'loading', value: undefined };
        }

        if (snapshot.status === 'error') {
            return snapshot;
        }

        return { status: snapshot.status, value: snapshot.value && { ...snapshot.value, search: this.query() } };
    });

    /** The rooms shown, with their search: the list of a former search kept until the new one is answered, none once the list failed */
    protected readonly rooms: Resource<RoomsList | undefined> = withPreviousValue({ snapshot: this.listSnapshot });
    // Completed once the list is destroyed
    private readonly listSnapshot$: Observable<ResourceSnapshot<RoomsList | undefined>> = toObservable(this.listSnapshot);

    public constructor() {
        effect((onCleanup: (cleanup: () => void) => void) => {
            // Restarted by a change of the game or of the search. A search is a query of its own, not repeated; a page
            // hidden, or without a person on it, asks nothing
            this.game();
            if (this.query() !== '' || !this.pageVisibility.visible() || !this.visitorPresent()) {
                return;
            }

            // Visible again: at once. The first list, and the one of a new search or game, are asked by the resource,
            // which ignores a refresh meanwhile
            untracked(() => this.refresh());
            const timer: ReturnType<typeof setInterval> = setInterval(() => this.refresh(), OpenRoomsComponent.REFRESH_INTERVAL);
            onCleanup(() => clearInterval(timer));
        });

        effect((onCleanup: (cleanup: () => void) => void) => {
            // Each failure by the server: asked again soon, the search included. A page hidden asks nothing, asked again
            // once visible
            this.serverFailures();
            if (!this.failedByServer() || !this.pageVisibility.visible()) {
                return;
            }

            const timer: ReturnType<typeof setTimeout> = setTimeout(() => this.refresh(), OpenRoomsComponent.RETRY_DELAY);
            onCleanup(() => clearTimeout(timer));
        });
    }

    /**
     * Once the server is ready (serverReady): true, or false once the list is removed meanwhile, the page closed or a room
     * of the list joined
     */
    public whenServerReady(): Promise<boolean> {
        return firstValueFrom(this.serverReady$.pipe(filter(Boolean)), { defaultValue: false });
    }

    /**
     * Searches the room of an id, the list showing it. Not before a person is on the page
     * @returns the room listed under that id, undefined once the API lists none: an id ended or unknown
     * @throws {Error} once the list of the search failed, the person typed another search, or the list was removed:
     * nothing is known of the room
     */
    public async findRoom(roomId: string): Promise<Readonly<OpenRoom> | undefined> {
        this.search.set({ text: roomId });
        // The answer of the search of the id, not the list shown before it (failed included), nor a search typed since
        const answer: ResourceSnapshot<RoomsList | undefined> = await firstValueFrom(this.listSnapshot$.pipe(
            filter((snapshot: ResourceSnapshot<RoomsList | undefined>) => untracked(this.search).text !== roomId
                || (untracked(this.query) === roomId && (snapshot.status === 'error' || snapshot.status === 'resolved'))),
        ));

        if (answer.status !== 'resolved' || untracked(this.search).text !== roomId) {
            throw new Error(`The room ${ roomId } could not be searched`);
        }

        return answer.value?.rooms.find((room: Readonly<OpenRoom>) => room.roomName === roomId);
    }

    /** Not again while a list is awaited: the resource reloads once loaded only */
    protected refresh(): void {
        this.roomsResource.reload();
    }

    /**
     * Asked by the person, its click telling one is on the page (VisitorPresenceService): a script clicking it asks
     * nothing. Its failures by the server counted anew: asked again MAX_RETRIES times more
     */
    protected askRooms(): void {
        this.serverFailures.set(0);
        this.refresh();
    }

    /**
     * The button showing the list, asked by the person, is removed: the focus moves to the title of the list, not lost
     * to the page for the screen reader that pressed it
     */
    protected showRooms(title: HTMLElement): void {
        title.focus();
        this.askRooms();
    }

    protected isFull(room: Readonly<OpenRoom>): boolean {
        return room.playerCount >= room.maxPlayer;
    }
}
