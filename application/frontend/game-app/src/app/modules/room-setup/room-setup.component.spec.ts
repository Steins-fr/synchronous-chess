import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogService } from '@app/services/dialog/dialog.service';
import { HTTP_API_SERVER } from '@app/services/room-api/http-api-server.token';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { answerOpenRooms, TEST_HTTP_API_SERVER } from '@testing/open-rooms.http';
import { TestHelper } from '@testing/test.helper';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { RoomCreate, RoomCreateDialog } from './room-create/room-create.dialog';
import { RoomJoin, RoomJoinDialog } from './room-join/room-join.dialog';
import { RoomSetupComponent } from './room-setup.component';
import { ServerBootingComponent } from './server-booting/server-booting.component';

describe('RoomSetupComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true };
    const privateRoom: OpenRoom = { roomName: 'private', playerCount: 1, maxPlayer: 2, isPrivate: true, hostConnected: true };
    let fixture: ComponentFixture<RoomSetupComponent>;
    let roomSetupService: RoomSetupService;
    let dialogService: DialogService;
    // A request of the socket of the page awaits the API
    let socketWaiting: WritableSignal<boolean>;

    /** @param answered whether the lists of the open rooms are answered, the database they wake awake */
    async function createComponent(answered: boolean = true): Promise<void> {
        dialogService = TestHelper.cast<DialogService>({ open: vi.fn() });
        socketWaiting = signal(false);
        await TestBed.configureTestingModule({
            imports: [RoomSetupComponent],
            providers: [
                RoomSetupService,
                { provide: HTTP_API_SERVER, useValue: TEST_HTTP_API_SERVER },
                { provide: DialogService, useValue: dialogService },
                // Provided by the page
                { provide: RoomSocketApi, useValue: TestHelper.cast<RoomSocketApi>({ waiting: socketWaiting }) },
            ],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        vi.spyOn(roomSetupService, 'setup');
        fixture = TestBed.createComponent(RoomSetupComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        if (answered) {
            answerOpenRooms([publicRoom, privateRoom]);
        }
        if (vi.isFakeTimers()) {
            fixture.detectChanges();
        } else {
            await fixture.whenStable();
        }
    }

    function createButton(): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector('#room-create');
    }

    /** Creates a room through the dialog, answering it */
    async function createRoom(room: RoomCreate | undefined): Promise<void> {
        vi.mocked(dialogService.open).mockResolvedValueOnce(room);
        createButton()?.click();
        await vi.waitFor(() => expect(dialogService.open).toHaveBeenCalled());
        await fixture.whenStable();
    }

    /** Joins a room of the list through the dialog, answering it */
    async function joinOpenRoom(roomName: string, join: RoomJoin | undefined): Promise<void> {
        await vi.waitFor(() => expect(fixture.nativeElement.querySelectorAll('app-open-rooms li')).toHaveLength(2));
        await fixture.whenStable();
        vi.mocked(dialogService.open).mockResolvedValueOnce(join);
        const row: Element = Array.from(fixture.nativeElement.querySelectorAll('app-open-rooms li') as NodeListOf<Element>)
            .find((item: Element) => item.textContent.includes(roomName)) as Element;
        (row.querySelector('button') as HTMLButtonElement).click();
        await vi.waitFor(() => expect(dialogService.open).toHaveBeenCalled());
        await fixture.whenStable();
    }

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test.each<[string, RoomCreate]>([
        ['public', { roomName: 'room', playerName: 'player' }],
        ['private', { roomName: 'room', playerName: 'player', password: 'secret' }],
    ])('should create the %s room given in the dialog', async (_case: string, room: RoomCreate) => {
        // Given
        await createComponent();

        // When
        await createRoom(room);

        // Then
        expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(RoomCreateDialog, { title: 'rooms.create.title', inputs: { roomName: '', playerName: '' } });
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', password: room.password });
    });

    test('should create the room given once the list woke the database, its button disabled meanwhile', async () => {
        // Given: the list awaited, the database it wakes still asleep
        vi.useFakeTimers();
        await createComponent(false);
        vi.mocked(dialogService.open).mockResolvedValueOnce({ roomName: 'room', playerName: 'player' });

        // When
        createButton()?.click();
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(createButton()?.disabled).toBe(true);

        // When
        answerOpenRooms([publicRoom]);
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', password: undefined });
    });

    test('should create the room given once a list shown asked again answered, telling the server boots meanwhile', async () => {
        // Given: a list shown, asked again, its refresh maybe waking the database
        vi.useFakeTimers();
        await createComponent();
        (fixture.nativeElement.querySelector('#open-rooms-refresh') as HTMLButtonElement).click();
        vi.mocked(dialogService.open).mockResolvedValueOnce({ roomName: 'room', playerName: 'player' });

        // When
        createButton()?.click();
        await vi.advanceTimersByTimeAsync(ServerBootingComponent.DELAY);
        fixture.detectChanges();

        // Then: told once, the list shown telling nothing
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(fixture.nativeElement.textContent.split('Starting the server…')).toHaveLength(2);

        // When
        answerOpenRooms([publicRoom]);
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', password: undefined });
        expect(fixture.nativeElement.textContent).not.toContain('Starting the server…');
    });

    test('should set no room up once the page closed while the list wakes the database', async () => {
        // Given
        vi.useFakeTimers();
        await createComponent(false);
        vi.mocked(dialogService.open).mockResolvedValueOnce({ roomName: 'room', playerName: 'player' });
        createButton()?.click();
        await vi.advanceTimersByTimeAsync(0);

        // When
        fixture.destroy();
        await vi.advanceTimersByTimeAsync(0);

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
    });

    test('should join the room of the list given while a room created waits for the list shown asked again, once it answered, creating none', async () => {
        // Given: a room given, waiting for the list shown asked again
        vi.useFakeTimers();
        await createComponent();
        (fixture.nativeElement.querySelector('#open-rooms-refresh') as HTMLButtonElement).click();
        vi.mocked(dialogService.open).mockResolvedValueOnce({ roomName: 'room', playerName: 'player' });
        createButton()?.click();
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();

        // When
        vi.mocked(dialogService.open).mockResolvedValueOnce({ playerName: 'bob' });
        (fixture.nativeElement.querySelector('app-open-rooms li button') as HTMLButtonElement).click();
        await vi.advanceTimersByTimeAsync(0);

        // Then: the join waits for the list too
        expect(roomSetupService.setup).not.toHaveBeenCalled();

        // When
        answerOpenRooms([publicRoom]);
        await vi.advanceTimersByTimeAsync(0);
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(0);

        // Then: the room given last only
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'join', game: RoomGame.CHESS, roomName: 'public', playerName: 'bob', password: undefined });
    });

    test('should give the dialogs the names given last, to try again once the room failed', async () => {
        // Given
        await createComponent();
        await createRoom({ roomName: 'room', playerName: 'player' });
        roomSetupService.roomIsSetup(false);
        // The form shown again lists the rooms again
        answerOpenRooms([publicRoom, privateRoom]);
        await fixture.whenStable();

        // When
        await createRoom(undefined);
        await joinOpenRoom('public', undefined);

        // Then
        expect(dialogService.open).toHaveBeenNthCalledWith(2, RoomCreateDialog, { title: 'rooms.create.title', inputs: { roomName: 'room', playerName: 'player' } });
        expect(dialogService.open).toHaveBeenNthCalledWith(3, RoomJoinDialog, {
            title: 'rooms.join.title',
            inputs: { roomName: 'public', isPrivate: false, playerName: 'player' },
        });
        expect(roomSetupService.setup).toHaveBeenCalledTimes(1);
    });

    test.each<[string, OpenRoom, RoomJoin]>([
        ['public', publicRoom, { playerName: 'bob' }],
        ['private', privateRoom, { playerName: 'bob', password: 'secret' }],
    ])('should join a %s room of the list under the name given in the dialog', async (_case: string, room: OpenRoom, join: RoomJoin) => {
        // Given
        await createComponent();

        // When
        await joinOpenRoom(room.roomName, join);

        // Then
        expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(RoomJoinDialog, {
            title: 'rooms.join.title',
            inputs: { roomName: room.roomName, isPrivate: room.isPrivate, playerName: '' },
        });
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'join', game: RoomGame.CHESS, roomName: room.roomName, playerName: 'bob', password: join.password });
    });

    test('should set no room up once a dialog is closed', async () => {
        // Given
        await createComponent();

        // When
        await createRoom(undefined);
        await joinOpenRoom('private', undefined);

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
    });

    test('should display a spinner while loading and hide once the room is setup', async () => {
        // Given
        await createComponent();
        expect(createButton()?.textContent.trim()).toEqual('Create a room');
        expect(fixture.nativeElement.querySelector('app-open-rooms #room-create')).toBe(createButton());

        // When
        roomSetupService.setup({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player' });
        await fixture.whenStable();

        // Then
        expect(createButton()).toBeNull();
        expect(fixture.nativeElement.querySelector('app-open-rooms')).toBeNull();
        expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
        expect(createButton()).toBeNull();
    });

    test('should tell the server boots while a request of the setup awaits the API long', async () => {
        // Given
        vi.useFakeTimers();
        await createComponent();
        roomSetupService.setup({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player' });
        fixture.detectChanges();

        // When
        socketWaiting.set(true);
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(ServerBootingComponent.DELAY);
        fixture.detectChanges();

        // Then
        expect(fixture.nativeElement.textContent).toContain('Starting the server…');

        // When: answered, the peers connecting
        socketWaiting.set(false);
        fixture.detectChanges();

        // Then
        expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();
        expect(fixture.nativeElement.textContent).not.toContain('Starting the server…');
    });
});
