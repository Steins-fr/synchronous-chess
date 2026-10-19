import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OpenRoomsComponent } from './open-rooms.component';

describe('OpenRoomsComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 4, isPrivate: false, hostConnected: true };
    const privateRoom: OpenRoom = { roomName: 'private', playerCount: 3, maxPlayer: 4, isPrivate: true, hostConnected: true };
    let fixture: ComponentFixture<OpenRoomsComponent>;
    let httpTesting: HttpTestingController;

    async function createComponent(game: RoomGame = RoomGame.CHESS, withCredentials?: boolean): Promise<void> {
        TestBed.configureTestingModule({
            providers: [
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                withCredentials === undefined ? [] : { provide: HTTP_API_WITH_CREDENTIALS, useValue: withCredentials },
            ],
        });
        httpTesting = TestBed.inject(HttpTestingController);
        fixture = TestBed.createComponent(OpenRoomsComponent);
        fixture.componentRef.setInput('game', game);
        await render();
    }

    // The timers are fake: the lists are received once they run. TestBed.tick() runs the effects too, the search typed
    async function render(time: number = 0): Promise<void> {
        TestBed.tick();
        await vi.advanceTimersByTimeAsync(time);
        TestBed.tick();
    }

    /** The request of the list awaited, of the search given */
    function listRequest(search?: string, game: RoomGame = RoomGame.CHESS): TestRequest {
        return httpTesting.expectOne(search === undefined ? `${ TEST_HTTP_API_SERVER }/rooms?game=${ game }` : `${ TEST_HTTP_API_SERVER }/rooms?game=${ game }&search=${ search }`);
    }

    async function answer(response: RoomsResponse, search?: string): Promise<void> {
        listRequest(search).flush(response);
        await render();
    }

    async function fail(search?: string): Promise<void> {
        listRequest(search).flush({ message: 'Server error.' }, { status: 500, statusText: 'Internal Server Error' });
        await render();
    }

    /** The requests awaited, none of them answered */
    function pendingRequests(): TestRequest[] {
        return httpTesting.match(() => true);
    }

    function text(): string {
        return fixture.nativeElement.textContent;
    }

    function rows(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('li'), (row: Element) => Array.from(row.children, (cell: Element) => cell.textContent.trim()).join(' '));
    }

    function refreshButton(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#open-rooms-refresh');
    }

    async function typeSearch(search: string): Promise<void> {
        const input: HTMLInputElement = fixture.nativeElement.querySelector('app-text-field[label="Rechercher une salle"] input');
        input.value = search;
        input.dispatchEvent(new Event('input'));
        // Touched: Material shows its error
        input.dispatchEvent(new Event('blur'));
        await render();
    }

    function hide(hidden: boolean): void {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should list the rooms of the game, telling the private ones', async () => {
        // Given
        await createComponent();
        const request: TestRequest = listRequest();

        // When
        request.flush({ rooms: [privateRoom, publicRoom], hasMore: false });
        await render();

        // Then: without the cookies of the browser, unless the stage is restricted
        expect(request.request.timeout).toEqual(30_000);
        expect(request.request.withCredentials).toBe(false);
        expect(rows()).toEqual([
            'lock private 3 / 4 Rejoindre',
            'public public Hôte : alice 1 / 4 Rejoindre',
        ]);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li mat-icon:not([aria-hidden="true"])'), (icon: Element) => icon.getAttribute('aria-label')))
            .toEqual(['Salle privée', 'Salle publique']);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li button'), (button: Element) => button.getAttribute('aria-label')))
            .toEqual(['Rejoindre la salle private', 'Rejoindre la salle public']);
        expect(text()).not.toContain('D\'autres salles correspondent');
    });

    test('should list the rooms with the cookies of the browser on a stage restricted to its owner', async () => {
        // Given
        await createComponent(RoomGame.CHESS, true);

        // When
        const request: TestRequest = listRequest();
        request.flush({ rooms: [publicRoom], hasMore: false });
        await render();

        // Then
        expect(request.request.withCredentials).toBe(true);
        expect(rows()).toEqual(['public public Hôte : alice 1 / 4 Rejoindre']);
    });

    test('should tell the full rooms and the ones waiting for their host, still joinable', async () => {
        // When
        await createComponent();
        await answer({
            rooms: [{ ...publicRoom, playerCount: 4 }, { ...privateRoom, playerCount: 4, hostConnected: false }],
            hasMore: false,
        });

        // Then
        expect(rows()).toEqual([
            'public public Hôte : alice Pleine 4 / 4 Rejoindre',
            'lock private Hôte en reconnexion 4 / 4 Rejoindre',
        ]);
    });

    test('should tell only the most recent rooms are listed, or more rooms match the search', async () => {
        // When
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: true });

        // Then
        expect(text()).toContain('Seules les salles les plus récentes sont affichées : recherchez les autres par leur nom.');

        // When
        await typeSearch('pub');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [publicRoom], hasMore: true }, 'pub');

        // Then
        expect(text()).toContain('D\'autres salles contiennent « pub » : précisez la recherche pour les trouver.');
    });

    test('should show the list of the search typed last, the request of a former search cancelled', async () => {
        // Given a search awaiting its list, the former list kept meanwhile
        await createComponent();
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });
        await typeSearch('pr');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        const former: TestRequest = listRequest('pr');
        expect(rows()).toHaveLength(2);

        // When another search is typed
        await typeSearch('private');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [privateRoom], hasMore: false }, 'private');

        // Then
        expect(former.cancelled).toBe(true);
        expect(rows()).toEqual(['lock private 3 / 4 Rejoindre']);
    });

    test('should tell the rooms are loading, then that there is none', async () => {
        // When
        await createComponent(RoomGame.CHAT);

        // Then
        expect(text()).toContain('Chargement des salles…');

        // When
        listRequest(undefined, RoomGame.CHAT).flush({ rooms: [], hasMore: false });
        await render();

        // Then
        expect(text()).toContain('Aucune salle à rejoindre pour le moment : créez la vôtre !');
        expect(rows()).toEqual([]);
    });

    test('should search the rooms once the player stops typing', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });

        // When
        await typeSearch(' bo');
        await typeSearch(' bob ');

        // Then
        expect(pendingRequests()).toEqual([]);

        // When the player stops typing: the request follows the search by a millisecond, the fake timers delaying a
        // timer of 0 scheduled while they run
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [], hasMore: false }, 'bob');

        // Then
        expect(text()).toContain('Aucune salle ne contient « bob ».');

        // When the time of a refresh passes, the page visible again
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then a search is not asked again
        expect(pendingRequests()).toEqual([]);

        // When
        refreshButton().click();
        await render();

        // Then
        await answer({ rooms: [], hasMore: false }, 'bob');
    });

    test('should search the rooms by a part of their name, its plus sign not read as a space by the API', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When
        await typeSearch('a+b & c#');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        await answer({ rooms: [], hasMore: false }, 'a%2Bb%20%26%20c%23');
        expect(text()).toContain('Aucune salle ne contient « a+b & c# ».');
    });

    test('should not send a too long search, the list kept', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY);

        // Then
        expect(pendingRequests()).toEqual([]);
        expect(rows()).toHaveLength(1);
        expect(fixture.nativeElement.querySelector('mat-error').textContent.trim()).toEqual('La recherche fait 64 caractères au plus');
    });

    test('should still show the list awaited once a too long search is typed', async () => {
        // Given
        await createComponent();

        // When
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
    });

    test('should still tell the rooms could not be loaded once a too long search is typed', async () => {
        // Given
        await createComponent();
        await fail();

        // When
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(pendingRequests()).toEqual([]);
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');
    });

    test('should refresh the list of the last search asked while a too long search is typed', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // When the time of a refresh passes
        await render(OpenRoomsComponent.REFRESH_INTERVAL);
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(2);

        // When
        refreshButton().click();
        await render();

        // Then
        await answer({ rooms: [publicRoom], hasMore: false });
        expect(rows()).toHaveLength(1);

        // When the player types the last search asked again
        await typeSearch('');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then it is not asked again
        expect(pendingRequests()).toEqual([]);
    });

    test('should show the search of the list shown, while the list of another search is awaited', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });
        await typeSearch('bob');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [], hasMore: false }, 'bob');

        // When
        await typeSearch('alice');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(text()).toContain('Aucune salle ne contient « bob ».');

        // When
        await answer({ rooms: [], hasMore: false }, 'alice');

        // Then
        expect(text()).toContain('Aucune salle ne contient « alice ».');
    });

    test('should tell the rooms could not be loaded, until a refresh lists them', async () => {
        // When
        await createComponent();
        await fail();

        // Then
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        refreshButton().click();
        await render();
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être chargées.');
        expect(rows()).toHaveLength(1);
    });

    test('should keep the rooms listed while a refresh is awaited, then hide them once it failed', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When
        refreshButton().click();
        await render();

        // Then
        expect(rows()).toHaveLength(1);

        // When
        await fail();

        // Then
        expect(rows()).toEqual([]);
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).toContain('Chargement des salles…');

        // When
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
    });

    test('should list the rooms again once a search cannot be sent', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When a search holding a lone surrogate, which HttpParams cannot encode
        await typeSearch('\uD800');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(pendingRequests()).toEqual([]);
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        await typeSearch('');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
    });

    test('should list the rooms again every 15 seconds while the page is visible, and once visible again', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When
        await render(OpenRoomsComponent.REFRESH_INTERVAL);
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(2);

        // When
        hide(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(pendingRequests()).toEqual([]);

        // When
        hide(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await render();

        // Then
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });
    });

    test('should list the rooms of a page opened hidden', async () => {
        // Given
        hide(true);

        // When
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
    });

    test('should not ask the rooms again while a list is awaited', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        await render(OpenRoomsComponent.REFRESH_INTERVAL);
        const awaited: TestRequest = listRequest();

        // When
        refreshButton().click();
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(awaited.cancelled).toBe(false);
        expect(pendingRequests()).toEqual([]);
    });

    test('should ask to join a room', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [privateRoom], hasMore: false });
        const joined: OpenRoom[] = [];
        fixture.componentInstance.joinRoom.subscribe((room: OpenRoom) => joined.push(room));

        // When
        (fixture.nativeElement.querySelector('li button') as HTMLButtonElement).click();

        // Then
        expect(joined).toEqual([privateRoom]);
    });
});
