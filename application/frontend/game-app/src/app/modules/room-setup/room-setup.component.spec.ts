import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { DialogService } from '@app/services/dialog/dialog.service';
import { RoomHttpApi } from '@app/services/room-api/room-http.api';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { openRoomsHttpApi } from '@testing/room-http-api.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { RoomCreate, RoomCreateDialog } from './room-create/room-create.dialog';
import { RoomJoin, RoomJoinDialog } from './room-join/room-join.dialog';
import { RoomSetupComponent } from './room-setup.component';

describe('RoomSetupComponent', () => {
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false, hostConnected: true };
    const privateRoom: OpenRoom = { roomName: 'private', playerCount: 1, maxPlayer: 2, isPrivate: true, hostConnected: true };
    let fixture: ComponentFixture<RoomSetupComponent>;
    let roomSetupService: RoomSetupService;
    let dialogService: DialogService;

    async function createComponent(queryParams: Params = {}): Promise<void> {
        dialogService = TestHelper.cast<DialogService>({ open: vi.fn() });
        await TestBed.configureTestingModule({
            imports: [RoomSetupComponent],
            providers: [
                RoomSetupService,
                { provide: RoomHttpApi, useValue: openRoomsHttpApi([publicRoom, privateRoom]) },
                { provide: DialogService, useValue: dialogService },
                { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
            ],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        vi.spyOn(roomSetupService, 'setup');
        vi.spyOn(CryptoHelper, 'randomNumber').mockReturnValue(123456);
        fixture = TestBed.createComponent(RoomSetupComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
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
        expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(RoomCreateDialog, { title: 'Créer une salle', inputs: { roomName: '', playerName: '' } });
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith({ type: 'create', game: RoomGame.CHESS, roomName: 'room', playerName: 'player', password: room.password });
    });

    test('should give the dialogs the names given last, to try again once the room failed', async () => {
        // Given
        await createComponent();
        await createRoom({ roomName: 'room', playerName: 'player' });
        roomSetupService.roomIsSetup(false);
        await fixture.whenStable();

        // When
        await createRoom(undefined);
        await joinOpenRoom('public', undefined);

        // Then
        expect(dialogService.open).toHaveBeenNthCalledWith(2, RoomCreateDialog, { title: 'Créer une salle', inputs: { roomName: 'room', playerName: 'player' } });
        expect(dialogService.open).toHaveBeenNthCalledWith(3, RoomJoinDialog, {
            title: 'Rejoindre la salle',
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
            title: 'Rejoindre la salle',
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
        expect(createButton()?.textContent.trim()).toEqual('Créer une salle');
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

    test('should automatically create the room', async () => {
        // When
        await createComponent({ 'auto-create': '', room: 'my-room' });

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith({ type: 'create', game: RoomGame.CHESS, roomName: 'my-room', playerName: '123456' });
    });

    test.each<[string, Params]>([
        ['no room', { 'auto-create': '' }],
        ['an empty room', { 'auto-create': '', room: '' }],
    ])('should automatically create the default room for a link with %s', async (_case: string, params: Params) => {
        // When
        await createComponent(params);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith({ type: 'create', game: RoomGame.CHESS, roomName: 'test', playerName: '123456' });
    });

    test('should automatically join the room after a delay', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '', room: 'my-room' });

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(roomSetupService.setup).toHaveBeenCalledWith({ type: 'join', game: RoomGame.CHESS, roomName: 'my-room', playerName: '123456' });
    });

    test('should automatically join the default room', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '' });
        await vi.advanceTimersByTimeAsync(1000);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith({ type: 'join', game: RoomGame.CHESS, roomName: 'test', playerName: '123456' });
    });
});
