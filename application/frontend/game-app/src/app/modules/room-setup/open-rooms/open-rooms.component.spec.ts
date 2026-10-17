import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomHttpApi } from '@app/services/room-api/room-http.api';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { openRoomsHttpApi } from '@testing/room-http-api.mock';
import { NEVER, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OpenRoomsComponent } from './open-rooms.component';

describe('OpenRoomsComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 4, isPrivate: false, hostConnected: true };
    const privateRoom: OpenRoom = { roomName: 'private', playerCount: 3, maxPlayer: 4, isPrivate: true, hostConnected: true };
    let fixture: ComponentFixture<OpenRoomsComponent>;
    let roomHttpApi: RoomHttpApi;

    /** Creates the component, the HTTP API answering its first request as given */
    async function createComponent(firstAnswer: Observable<RoomsResponse> | RoomsResponse, game: RoomGame = RoomGame.CHESS): Promise<void> {
        roomHttpApi = openRoomsHttpApi([publicRoom]);
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValueOnce(firstAnswer instanceof Observable ? firstAnswer : of(firstAnswer));
        TestBed.configureTestingModule({ providers: [{ provide: RoomHttpApi, useValue: roomHttpApi }] });
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
        // When
        await createComponent({ rooms: [privateRoom, publicRoom], hasMore: false });

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledExactlyOnceWith({ game: RoomGame.CHESS, search: undefined });
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

    test('should tell the full rooms and the ones waiting for their host, still joinable', async () => {
        // When
        await createComponent({
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
        await createComponent({ rooms: [publicRoom], hasMore: true });

        // Then
        expect(text()).toContain('Seules les salles les plus récentes sont affichées : recherchez les autres par leur nom.');

        // When
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValue(of({ rooms: [publicRoom], hasMore: true }));
        await typeSearch('pub');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(text()).toContain('D\'autres salles contiennent « pub » : précisez la recherche pour les trouver.');
    });

    test('should show the list of the search typed last, the request of a former search cancelled', async () => {
        // Given a search awaiting its list
        await createComponent({ rooms: [publicRoom, privateRoom], hasMore: false });
        const former = new Subject<RoomsResponse>();
        vi.mocked(roomHttpApi.getOpenRooms)
            .mockReturnValueOnce(former)
            .mockReturnValueOnce(of({ rooms: [privateRoom], hasMore: false }));
        await typeSearch('pr');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        expect(former.observed).toBe(true);

        // When another search is typed
        await typeSearch('private');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(former.observed).toBe(false);
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(3);
        expect(rows()).toEqual(['lock private 3 / 4 Rejoindre']);
    });

    test('should tell the rooms are loading, then that there is none', async () => {
        // Given
        const answer = new Subject<RoomsResponse>();

        // When
        await createComponent(answer, RoomGame.CHAT);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledExactlyOnceWith({ game: RoomGame.CHAT, search: undefined });
        expect(text()).toContain('Chargement des salles…');

        // When
        answer.next({ rooms: [], hasMore: false });
        answer.complete();
        await render();

        // Then
        expect(text()).toContain('Aucune salle à rejoindre pour le moment : créez la vôtre !');
        expect(rows()).toEqual([]);
    });

    test('should search the rooms once the player stops typing', async () => {
        // Given
        await createComponent({ rooms: [publicRoom, privateRoom], hasMore: false });
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValue(of({ rooms: [], hasMore: false }));

        // When
        await typeSearch(' bo');
        await typeSearch(' bob ');

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(1);

        // When the player stops typing: the request follows the search by a millisecond, the fake timers delaying a
        // timer of 0 scheduled while they run
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(2);
        expect(roomHttpApi.getOpenRooms).toHaveBeenLastCalledWith({ game: RoomGame.CHESS, search: 'bob' });
        expect(text()).toContain('Aucune salle ne contient « bob ».');

        // When the time of a refresh passes, the page visible again
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then a search is not asked again
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(2);

        // When
        refreshButton().click();
        await render();

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(3);
        expect(roomHttpApi.getOpenRooms).toHaveBeenLastCalledWith({ game: RoomGame.CHESS, search: 'bob' });
    });

    test('should not send a too long search, the list kept', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });

        // When
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(1);
        expect(rows()).toHaveLength(1);
        expect(fixture.nativeElement.querySelector('mat-error').textContent.trim()).toEqual('La recherche fait 64 caractères au plus');
    });

    test('should tell the rooms could not be loaded, until a refresh lists them', async () => {
        // When
        await createComponent(throwError(() => new Error('Http failure response')));

        // Then
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être chargées.');
        expect(rows()).toHaveLength(1);
    });

    test('should keep the rooms listed when a refresh fails', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValueOnce(throwError(() => new Error('Http failure response')));

        // When
        refreshButton().click();
        await render();

        // Then
        expect(rows()).toHaveLength(1);
        expect(text()).toContain('Les salles n\'ont pas pu être actualisées.');
        expect(text()).not.toContain('Les salles n\'ont pas pu être chargées.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être actualisées.');
    });

    test('should list the rooms again once a request could not be built', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });
        // What HttpParams throws building the request of a search it cannot encode (a lone surrogate)
        vi.mocked(roomHttpApi.getOpenRooms).mockImplementationOnce((): Observable<RoomsResponse> => {
            throw new URIError('URI malformed');
        });

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).toContain('Les salles n\'ont pas pu être actualisées.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être actualisées.');
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(3);
    });

    test('should list the rooms again every 15 seconds while the page is visible, and once visible again', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValue(of({ rooms: [publicRoom, privateRoom], hasMore: false }));

        // When
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(2);
        expect(rows()).toHaveLength(2);

        // When
        hide(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(2);

        // When
        hide(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await render();

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(3);
    });

    test('should list the rooms of a page opened hidden', async () => {
        // Given
        hide(true);

        // When
        await createComponent({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
    });

    test('should not ask the rooms again while a list is awaited', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });
        vi.mocked(roomHttpApi.getOpenRooms).mockReturnValue(NEVER);

        // When
        await render(OpenRoomsComponent.REFRESH_INTERVAL);
        refreshButton().click();
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomHttpApi.getOpenRooms).toHaveBeenCalledTimes(2);
    });

    test('should ask to join a room', async () => {
        // Given
        await createComponent({ rooms: [privateRoom], hasMore: false });
        const joined: OpenRoom[] = [];
        fixture.componentInstance.joinRoom.subscribe((room: OpenRoom) => joined.push(room));

        // When
        (fixture.nativeElement.querySelector('li button') as HTMLButtonElement).click();

        // Then
        expect(joined).toEqual([privateRoom]);
    });
});
