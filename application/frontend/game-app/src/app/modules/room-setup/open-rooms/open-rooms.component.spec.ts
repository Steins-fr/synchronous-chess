import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { openRoomsSocketApi } from '@testing/room-socket-api.mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OpenRoomsComponent } from './open-rooms.component';

describe('OpenRoomsComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 4, isPrivate: false, hostConnected: true };
    const privateRoom: OpenRoom = { roomName: 'private', hostPlayer: 'bob', playerCount: 3, maxPlayer: 4, isPrivate: true, hostConnected: true };
    let fixture: ComponentFixture<OpenRoomsComponent>;
    let roomSocketApi: RoomSocketApi;

    /** Creates the component, its socket answering the first request as given */
    async function createComponent(firstAnswer: Promise<RoomsResponse> | RoomsResponse | Error, game: RoomGame = RoomGame.CHESS): Promise<void> {
        roomSocketApi = openRoomsSocketApi([publicRoom]);
        if (firstAnswer instanceof Error) {
            vi.mocked(roomSocketApi.send).mockRejectedValueOnce(firstAnswer);
        } else {
            vi.mocked(roomSocketApi.send).mockReturnValueOnce(Promise.resolve(firstAnswer));
        }
        TestBed.configureTestingModule({ providers: [{ provide: RoomSocketApi, useValue: roomSocketApi }] });
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
        const input: HTMLInputElement = fixture.nativeElement.querySelector('app-text-field[label="Rechercher une salle ou un hôte"] input');
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
        expect(roomSocketApi.send).toHaveBeenCalledExactlyOnceWith(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game: RoomGame.CHESS, search: undefined });
        expect(rows()).toEqual([
            'lock private Hôte : bob 3 / 4 Rejoindre',
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
            'lock private Hôte : bob Hôte en reconnexion 4 / 4 Rejoindre',
        ]);
    });

    test('should tell only the most recent rooms are listed, or more rooms match the search', async () => {
        // When
        await createComponent({ rooms: [publicRoom], hasMore: true });

        // Then
        expect(text()).toContain('Seules les salles les plus récentes sont affichées : recherchez les autres par leur nom ou celui de leur hôte.');

        // When
        vi.mocked(roomSocketApi.send).mockResolvedValue({ rooms: [publicRoom], hasMore: true });
        await typeSearch('pub');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(text()).toContain('D\'autres salles correspondent : précisez la recherche pour les trouver.');
    });

    test('should show the list of the search typed last, the one of a former search received after it dropped', async () => {
        // Given
        await createComponent({ rooms: [publicRoom, privateRoom], hasMore: false });
        let answerFormer: (response: RoomsResponse) => void = () => undefined;
        vi.mocked(roomSocketApi.send)
            .mockReturnValueOnce(new Promise<RoomsResponse>((resolve) => answerFormer = resolve))
            .mockResolvedValueOnce({ rooms: [privateRoom], hasMore: false });
        await typeSearch('pr');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // When the second search is answered first
        await typeSearch('private');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        answerFormer({ rooms: [publicRoom], hasMore: false });
        await render();

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
        expect(rows()).toEqual(['lock private Hôte : bob 3 / 4 Rejoindre']);
    });

    test('should tell the rooms are loading, then that there is none', async () => {
        // Given
        let answer: (response: RoomsResponse) => void = () => undefined;

        // When
        await createComponent(new Promise<RoomsResponse>((resolve) => answer = resolve), RoomGame.CHAT);

        // Then
        expect(text()).toContain('Chargement des salles…');

        // When
        answer({ rooms: [], hasMore: false });
        await render();

        // Then
        expect(text()).toContain('Aucune salle à rejoindre pour le moment : créez la vôtre !');
        expect(rows()).toEqual([]);
    });

    test('should search the rooms once the player stops typing', async () => {
        // Given
        await createComponent({ rooms: [publicRoom, privateRoom], hasMore: false });
        vi.mocked(roomSocketApi.send).mockResolvedValue({ rooms: [], hasMore: false });

        // When
        await typeSearch(' bo');
        await typeSearch(' bob ');

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);

        // When the player stops typing: the request follows the search by a millisecond, the fake timers delaying a
        // timer of 0 scheduled while they run
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        expect(roomSocketApi.send).toHaveBeenLastCalledWith(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game: RoomGame.CHESS, search: 'bob' });
        expect(text()).toContain('Aucune salle ne correspond à « bob ».');

        // When the list refreshes
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenLastCalledWith(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game: RoomGame.CHESS, search: 'bob' });
    });

    test('should not send a too long search, the list kept', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });

        // When
        await typeSearch('s'.repeat(65));
        await render(OpenRoomsComponent.SEARCH_DELAY);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(1);
        expect(rows()).toHaveLength(1);
        expect(fixture.nativeElement.querySelector('mat-error').textContent.trim()).toEqual('La recherche fait 64 caractères au plus');
    });

    test('should tell the rooms could not be loaded, until a refresh lists them', async () => {
        // When
        await createComponent(new Error('The request has timeout.'));

        // Then
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être chargées.');
        expect(rows()).toHaveLength(1);
    });

    test('should list the rooms again every 15 seconds while the page is visible, and once visible again', async () => {
        // Given
        await createComponent({ rooms: [publicRoom], hasMore: false });
        vi.mocked(roomSocketApi.send).mockResolvedValue({ rooms: [publicRoom, privateRoom], hasMore: false });

        // When
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        expect(rows()).toHaveLength(2);

        // When
        hide(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);

        // When
        hide(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await render();

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(3);
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
        vi.mocked(roomSocketApi.send).mockReturnValue(new Promise(() => undefined));

        // When
        await render(OpenRoomsComponent.REFRESH_INTERVAL);
        refreshButton().click();
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
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
