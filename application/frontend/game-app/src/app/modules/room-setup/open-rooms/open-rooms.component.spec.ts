import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { RoomGame } from '@protocol/room-game.enum';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomApiRequestTypeEnum } from '@protocol/socket-packet-payload.type';
import { openRoomsSocketApi } from '@testing/room-socket-api.mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { OpenRoomsComponent } from './open-rooms.component';

describe('OpenRoomsComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 4, isPrivate: false };
    const privateRoom: OpenRoom = { roomName: 'private', hostPlayer: 'bob', playerCount: 3, maxPlayer: 4, isPrivate: true };
    let fixture: ComponentFixture<OpenRoomsComponent>;
    let roomSocketApi: RoomSocketApi;

    async function createComponent(rooms: OpenRoom[]): Promise<void> {
        roomSocketApi = openRoomsSocketApi(rooms);
        TestBed.configureTestingModule({ providers: [{ provide: RoomSocketApi, useValue: roomSocketApi }] });
        fixture = TestBed.createComponent(OpenRoomsComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        await render();
    }

    // The timers are fake: the lists are received once they run
    async function render(): Promise<void> {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();
    }

    function text(): string {
        return fixture.nativeElement.textContent;
    }

    function rows(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('li'), (row: Element) => Array.from(row.children, (cell: Element) => cell.textContent.trim()).join(' '));
    }

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should list the open rooms of the game, telling the private ones', async () => {
        // When
        await createComponent([privateRoom, publicRoom]);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledExactlyOnceWith(RoomApiRequestTypeEnum.ROOM_GET_ALL, { game: RoomGame.CHESS });
        expect(rows()).toEqual([
            'lock private Hôte : bob 3 / 4 Rejoindre',
            'public public Hôte : alice 1 / 4 Rejoindre',
        ]);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li mat-icon:not([aria-hidden="true"])'), (icon: Element) => icon.getAttribute('aria-label')))
            .toEqual(['Salle privée', 'Salle publique']);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li button'), (button: Element) => button.getAttribute('aria-label')))
            .toEqual(['Rejoindre la salle private', 'Rejoindre la salle public']);
    });

    test('should tell the rooms are loading, then that there is none', async () => {
        // Given
        let answer: (response: { rooms: OpenRoom[] }) => void = () => undefined;
        roomSocketApi = openRoomsSocketApi();
        vi.mocked(roomSocketApi.send).mockReturnValue(new Promise((resolve) => answer = resolve));
        TestBed.configureTestingModule({ providers: [{ provide: RoomSocketApi, useValue: roomSocketApi }] });
        fixture = TestBed.createComponent(OpenRoomsComponent);
        fixture.componentRef.setInput('game', RoomGame.CHAT);

        // When
        await render();

        // Then
        expect(text()).toContain('Chargement des salles…');

        // When
        answer({ rooms: [] });
        await render();

        // Then
        expect(text()).toContain('Aucune salle à rejoindre pour le moment : créez la vôtre !');
        expect(rows()).toEqual([]);
    });

    test('should tell the rooms could not be loaded, until a refresh lists them', async () => {
        // Given
        roomSocketApi = openRoomsSocketApi([publicRoom]);
        vi.mocked(roomSocketApi.send).mockRejectedValueOnce(new Error('The request has timeout.'));
        TestBed.configureTestingModule({ providers: [{ provide: RoomSocketApi, useValue: roomSocketApi }] });
        fixture = TestBed.createComponent(OpenRoomsComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);

        // When
        await render();

        // Then
        expect(text()).toContain('Les salles n\'ont pas pu être chargées.');

        // When
        (fixture.nativeElement.querySelector('#open-rooms-refresh') as HTMLButtonElement).click();
        await render();

        // Then
        expect(text()).not.toContain('Les salles n\'ont pas pu être chargées.');
        expect(rows()).toHaveLength(1);
    });

    test('should list the rooms again every 15 seconds while the page is visible', async () => {
        // Given
        await createComponent([publicRoom]);
        vi.mocked(roomSocketApi.send).mockResolvedValue({ rooms: [publicRoom, privateRoom] });

        // When
        await vi.advanceTimersByTimeAsync(OpenRoomsComponent.REFRESH_INTERVAL);
        fixture.detectChanges();

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
        expect(rows()).toHaveLength(2);

        // When
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        await vi.advanceTimersByTimeAsync(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
    });

    test('should not ask the rooms again while a list is awaited', async () => {
        // Given
        await createComponent([publicRoom]);
        vi.mocked(roomSocketApi.send).mockReturnValue(new Promise(() => undefined));

        // When
        await vi.advanceTimersByTimeAsync(OpenRoomsComponent.REFRESH_INTERVAL);
        (fixture.nativeElement.querySelector('#open-rooms-refresh') as HTMLButtonElement).click();
        await vi.advanceTimersByTimeAsync(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(roomSocketApi.send).toHaveBeenCalledTimes(2);
    });

    test('should ask to join a room', async () => {
        // Given
        await createComponent([privateRoom]);
        const joined: OpenRoom[] = [];
        fixture.componentInstance.joinRoom.subscribe((room: OpenRoom) => joined.push(room));

        // When
        (fixture.nativeElement.querySelector('li button') as HTMLButtonElement).click();

        // Then
        expect(joined).toEqual([privateRoom]);
    });
});
