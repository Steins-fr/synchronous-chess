import { HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { HTTP_API_WITH_CREDENTIALS } from '@app/services/room-api/http-api-with-credentials.token';
import { ServerBootingComponent } from '@app/modules/room-setup/server-booting/server-booting.component';
import { VisitorPresenceService } from '@app/services/visitor-presence/visitor-presence.service';
import RoomsResponse, { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { textFieldInput } from '@testing/text-field.helper';
import { VisitorPresenceMock } from '@testing/visitor-presence.mock';
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

    /** A list refused by the API: not asked again on its own, unlike a failure of the server */
    async function fail(search?: string): Promise<void> {
        listRequest(search).flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
        await render();
    }

    /** A list failed by the server, its paused database still resuming: asked again soon */
    async function serverFail(search?: string): Promise<void> {
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

    function showButton(): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector('#open-rooms-show');
    }

    async function typeSearch(search: string): Promise<void> {
        const input: HTMLInputElement = textFieldInput(fixture.nativeElement, 'Search for a room');
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
            'lock private 3 / 4 Join',
            'public public Host: alice 1 / 4 Join',
        ]);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li mat-icon:not([aria-hidden="true"])'), (icon: Element) => icon.getAttribute('aria-label')))
            .toEqual(['Private room', 'Public room']);
        expect(Array.from(fixture.nativeElement.querySelectorAll('li button'), (button: Element) => button.getAttribute('aria-label')))
            .toEqual(['Join the room private', 'Join the room public']);
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
        expect(rows()).toEqual(['public public Host: alice 1 / 4 Join']);
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
            'public public Host: alice Full 4 / 4 Join',
            'lock private Host reconnecting 4 / 4 Join',
        ]);
    });

    test('should tell only the most recent rooms are listed, or more rooms match the search', async () => {
        // When
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: true });

        // Then
        expect(text()).toContain('Only the most recent rooms are shown: search for the others by their name.');

        // When
        await typeSearch('pub');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [publicRoom], hasMore: true }, 'pub');

        // Then
        expect(text()).toContain('Other rooms contain “pub”: refine the search to find them.');
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
        expect(rows()).toEqual(['lock private 3 / 4 Join']);
    });

    test('should tell the rooms are loading, then that there is none', async () => {
        // When
        await createComponent(RoomGame.CHAT);

        // Then
        expect(text()).toContain('Loading the rooms…');

        // When
        listRequest(undefined, RoomGame.CHAT).flush({ rooms: [], hasMore: false });
        await render();

        // Then
        expect(text()).toContain('No room to join for now: create yours!');
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
        expect(text()).toContain('No room contains “bob”.');

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
        expect(text()).toContain('No room contains “a+b & c#”.');
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
        expect(fixture.nativeElement.querySelector('mat-error').textContent.trim()).toEqual('The search is at most 64 characters long');
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
        expect(text()).toContain('The rooms could not be loaded.');
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
        expect(text()).toContain('No room contains “bob”.');

        // When
        await answer({ rooms: [], hasMore: false }, 'alice');

        // Then
        expect(text()).toContain('No room contains “alice”.');
    });

    test('should tell the rooms could not be loaded, until a refresh lists them', async () => {
        // When
        await createComponent();
        await fail();

        // Then
        expect(text()).toContain('The rooms could not be loaded.');

        // When
        refreshButton().click();
        await render();
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(text()).not.toContain('The rooms could not be loaded.');
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
        expect(text()).toContain('The rooms could not be loaded.');

        // When
        refreshButton().click();
        await render();

        // Then
        expect(text()).toContain('Loading the rooms…');

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
        expect(text()).toContain('The rooms could not be loaded.');

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

    test('should tell the server boots while a list is awaited long, its database resuming', async () => {
        // Given
        await createComponent();

        // When
        await render(ServerBootingComponent.DELAY);

        // Then
        expect(text()).toContain('Loading the rooms…');
        expect(text()).toContain('Starting the server…');

        // When
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(text()).not.toContain('Starting the server…');
    });

    test('should not tell the server boots while a list shown is refreshed long, nor while a search is awaited long', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When: a slow network
        refreshButton().click();
        await render(ServerBootingComponent.DELAY);

        // Then
        expect(rows()).toHaveLength(1);
        expect(text()).not.toContain('Starting the server…');

        // When
        await answer({ rooms: [publicRoom], hasMore: false });
        await typeSearch('alice');
        await render(OpenRoomsComponent.SEARCH_DELAY + ServerBootingComponent.DELAY);

        // Then: the list of the former search shown meanwhile
        expect(rows()).toHaveLength(1);
        expect(text()).not.toContain('Starting the server…');
        listRequest('alice');
    });

    test.each<[string, (request: TestRequest) => void]>([
        ['the server', (request: TestRequest) => request.flush({ message: 'Server error.' }, { status: 500, statusText: 'Internal Server Error' })],
        ['the network', (request: TestRequest) => request.error(new ProgressEvent('error'))],
    ])('should ask the list again soon once failed by %s, the server still booting', async (_case: string, failure: (request: TestRequest) => void) => {
        // Given
        await createComponent();
        await render(ServerBootingComponent.DELAY);
        expect(text()).toContain('Starting the server…');

        // When: the paused database still resuming
        failure(listRequest());
        await render();

        // Then
        expect(text()).toContain('Loading the rooms…');
        expect(text()).toContain('Starting the server…');
        expect(text()).not.toContain('The rooms could not be loaded.');
        expect(pendingRequests()).toEqual([]);

        // When
        await render(OpenRoomsComponent.RETRY_DELAY);
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(1);
        expect(text()).not.toContain('Starting the server…');
    });

    test('should keep the list shown while a refresh failed by the server is asked again, telling nothing', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When: a refresh meets a transient failure
        refreshButton().click();
        await render();
        await serverFail();
        await render(ServerBootingComponent.DELAY);

        // Then
        expect(rows()).toHaveLength(1);
        expect(text()).not.toContain('Starting the server…');
        expect(text()).not.toContain('The rooms could not be loaded.');

        // When
        await answer({ rooms: [publicRoom, privateRoom], hasMore: false });

        // Then
        expect(rows()).toHaveLength(2);
    });

    test('should tell the server is ready once the list answered, or failed otherwise than by the server booting', async () => {
        // Given
        await createComponent();

        // Then: the database the list wakes still asleep
        expect(fixture.componentInstance.serverReady()).toBe(false);

        // When
        await serverFail();

        // Then
        expect(fixture.componentInstance.serverReady()).toBe(false);

        // When
        await render(OpenRoomsComponent.RETRY_DELAY);
        await answer({ rooms: [], hasMore: false });

        // Then
        expect(fixture.componentInstance.serverReady()).toBe(true);

        // When: refused, the API answered
        refreshButton().click();
        await render();
        await fail();

        // Then
        expect(fixture.componentInstance.serverReady()).toBe(true);
    });

    test('should not tell the server is ready while a list shown is asked again, its refresh maybe waking the database', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [publicRoom], hasMore: false });

        // When: back to a page hidden for a day, the database in its deep sleep
        refreshButton().click();
        await render();

        // Then
        expect(fixture.componentInstance.serverReady()).toBe(false);

        // When: the list shown kept
        await serverFail();
        await render(OpenRoomsComponent.RETRY_DELAY);

        // Then
        expect(rows()).toHaveLength(1);
        expect(fixture.componentInstance.serverReady()).toBe(false);

        // When
        await answer({ rooms: [publicRoom], hasMore: false });

        // Then
        expect(fixture.componentInstance.serverReady()).toBe(true);
    });

    test('should ask the list again at each failure by the server, the search included', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [], hasMore: false });
        await typeSearch('alice');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // When
        await serverFail('alice');
        await render(OpenRoomsComponent.RETRY_DELAY);
        await serverFail('alice');
        await render(OpenRoomsComponent.RETRY_DELAY);

        // Then: asked again, the database still resuming
        await answer({ rooms: [publicRoom], hasMore: false }, 'alice');
        expect(rows()).toHaveLength(1);
    });

    test('should tell the rooms could not be loaded once the server failed them too many times, until the refresh asks them again', async () => {
        // Given
        await createComponent();
        await serverFail();
        for (let retry: number = 0; retry < OpenRoomsComponent.MAX_RETRIES; retry++) {
            await render(OpenRoomsComponent.RETRY_DELAY);
            await serverFail();
        }

        // When
        await render(OpenRoomsComponent.RETRY_DELAY);

        // Then: offline, or refused
        expect(pendingRequests()).toEqual([]);
        expect(text()).toContain('The rooms could not be loaded.');
        expect(text()).not.toContain('Starting the server…');

        // When
        refreshButton().click();
        await render();
        await serverFail();
        await render(OpenRoomsComponent.RETRY_DELAY);

        // Then
        await answer({ rooms: [publicRoom], hasMore: false });
        expect(rows()).toHaveLength(1);
    });

    test('should find the room of an id in the list of its search', async () => {
        // Given
        const listed: OpenRoom = { ...publicRoom, roomName: 'room#000001' };
        await createComponent();
        await answer({ rooms: [], hasMore: false });

        // When
        const found: Promise<Readonly<OpenRoom> | undefined> = fixture.componentInstance.findRoom('room#000001');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [{ ...publicRoom, roomName: 'room#0000011' }, listed], hasMore: false }, 'room%23000001');

        // Then
        await expect(found).resolves.toEqual(listed);
        expect(textFieldInput(fixture.nativeElement, 'Search for a room').value).toBe('room#000001');
    });

    test('should find no room of an id the API does not list', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [], hasMore: false });

        // When
        const unknown: Promise<Readonly<OpenRoom> | undefined> = fixture.componentInstance.findRoom('room#000001');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await answer({ rooms: [publicRoom], hasMore: false }, 'room%23000001');

        // Then
        await expect(unknown).resolves.toBeUndefined();
    });

    test('should fail to find a room once the list of its search failed, not on the failure of the list shown before', async () => {
        // Given: the list shown failed
        await createComponent();
        await fail();

        // When
        const found: Promise<Readonly<OpenRoom> | undefined> = fixture.componentInstance.findRoom('room#000001');
        const settled = vi.fn();
        found.then(settled, settled);
        await render();

        // Then: the search is awaited
        expect(settled).not.toHaveBeenCalled();

        // When
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);
        await fail('room%23000001');

        // Then
        await expect(found).rejects.toThrow('could not be searched');
    });

    test('should fail to find a room once the person typed another search', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [], hasMore: false });
        const found: Promise<Readonly<OpenRoom> | undefined> = fixture.componentInstance.findRoom('room#000001');
        const rejected = expect(found).rejects.toThrow('could not be searched');

        // When
        await typeSearch('alice');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // Then
        await rejected;
    });

    test('should fail to find a room once the list is removed', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [], hasMore: false });
        const found: Promise<Readonly<OpenRoom> | undefined> = fixture.componentInstance.findRoom('room#000001');

        // When
        fixture.destroy();

        // Then
        await expect(found).rejects.toThrow();
    });

    test('should not ask the list failed by the server again while the page is hidden, until it is visible again', async () => {
        // Given
        await createComponent();
        await answer({ rooms: [], hasMore: false });
        await typeSearch('alice');
        await render(OpenRoomsComponent.SEARCH_DELAY + 1);

        // When
        hide(true);
        document.dispatchEvent(new Event('visibilitychange'));
        await serverFail('alice');
        await render(OpenRoomsComponent.REFRESH_INTERVAL);

        // Then
        expect(pendingRequests()).toEqual([]);

        // When
        hide(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await render(OpenRoomsComponent.RETRY_DELAY);

        // Then
        await answer({ rooms: [publicRoom], hasMore: false }, 'alice');
        expect(rows()).toHaveLength(1);
    });

    describe('without a person on the page', () => {
        let visitorPresence: VisitorPresenceMock;

        beforeEach(() => {
            visitorPresence = new VisitorPresenceMock(false);
            TestBed.configureTestingModule({ providers: [{ provide: VisitorPresenceService, useValue: visitorPresence }] });
        });

        test('should ask nothing, as for a bot rendering the page, until a person is on it', async () => {
            // Given
            await createComponent();

            // When
            await render(OpenRoomsComponent.REFRESH_INTERVAL);

            // Then: the paused database stays asleep
            expect(pendingRequests()).toEqual([]);
            expect(text()).not.toContain('Loading the rooms…');
            expect(showButton()?.textContent.trim()).toBe('Show the open rooms');

            // When
            visitorPresence.notice();
            await render();
            await answer({ rooms: [publicRoom], hasMore: false });

            // Then
            expect(showButton()).toBeNull();
            expect(rows()).toHaveLength(1);

            // When
            await render(OpenRoomsComponent.REFRESH_INTERVAL);

            // Then: asked again
            await answer({ rooms: [publicRoom, privateRoom], hasMore: false });
            expect(rows()).toHaveLength(2);
        });

        test.each([
            ['its button', (): HTMLButtonElement | null => showButton()],
            ['the refresh button', (): HTMLButtonElement | null => refreshButton()],
        ])('should list the rooms once a person clicks %s, as with a screen reader', async (_case: string, button: () => HTMLButtonElement | null) => {
            // Given
            await createComponent();

            // When: the click seen by the service first, captured
            visitorPresence.notice();
            button()?.click();
            await render();
            await answer({ rooms: [publicRoom], hasMore: false });

            // Then
            expect(rows()).toHaveLength(1);
        });

        test.each([
            ['its button', (): HTMLButtonElement | null => showButton()],
            ['the refresh button', (): HTMLButtonElement | null => refreshButton()],
        ])('should ask nothing once a script clicks %s, its click untrusted', async (_case: string, button: () => HTMLButtonElement | null) => {
            // Given
            await createComponent();

            // When
            button()?.click();
            await render();

            // Then
            expect(pendingRequests()).toEqual([]);
            expect(showButton()).not.toBeNull();
        });

        test('should not tell the server is ready before a person is on the page: nothing asked', async () => {
            // When
            await createComponent();

            // Then
            expect(fixture.componentInstance.serverReady()).toBe(false);
        });

        test('should move the focus to the title of the list once its button, removed, is clicked', async () => {
            // Given
            await createComponent();
            showButton()?.focus();

            // When
            visitorPresence.notice();
            showButton()?.click();
            await render();

            // Then: not lost to the page
            expect(showButton()).toBeNull();
            expect(document.activeElement?.textContent).toBe('Open rooms');
            listRequest();
        });
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
