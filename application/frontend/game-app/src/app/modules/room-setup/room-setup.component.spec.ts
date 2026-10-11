import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { RoomSetupComponent } from './room-setup.component';
import { RoomPasswordDialog } from './room-password/room-password.dialog';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import { DialogService } from '@app/services/dialog/dialog.service';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { OpenRoom } from '@protocol/responses/rooms-response';
import { RoomGame } from '@protocol/room-game.enum';
import { openRoomsSocketApi } from '@testing/room-socket-api.mock';
import { TestHelper } from '@testing/test.helper';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('RoomSetupComponent', () => {
    let fixture: ComponentFixture<RoomSetupComponent>;
    let roomSetupService: RoomSetupService;
    let dialogService: DialogService;
    const publicRoom: OpenRoom = { roomName: 'public', hostPlayer: 'alice', playerCount: 1, maxPlayer: 2, isPrivate: false };
    const privateRoom: OpenRoom = { roomName: 'private', hostPlayer: 'bob', playerCount: 1, maxPlayer: 2, isPrivate: true };

    async function createComponent(queryParams: Params = {}): Promise<void> {
        dialogService = TestHelper.cast<DialogService>({ open: vi.fn() });
        await TestBed.configureTestingModule({
            imports: [RoomSetupComponent],
            providers: [
                RoomSetupService,
                { provide: RoomSocketApi, useValue: openRoomsSocketApi([publicRoom, privateRoom]) },
                { provide: DialogService, useValue: dialogService },
                { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
            ],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        vi.spyOn(roomSetupService, 'setup');
        vi.spyOn(CryptoHelper, 'randomNumber').mockReturnValue(123456);
        fixture = TestBed.createComponent(RoomSetupComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
        fixture.componentRef.setInput('maxPlayer', 2);
        if (vi.isFakeTimers()) {
            fixture.detectChanges();
        } else {
            await fixture.whenStable();
        }
    }

    function buttons(): HTMLButtonElement[] {
        return Array.from(fixture.nativeElement.querySelectorAll('button'));
    }

    async function typeIn(label: string, value: string): Promise<void> {
        const input: HTMLInputElement = fixture.nativeElement.querySelector(`app-text-field[label="${ label }"] input`);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    /** The button joining a room of the list */
    async function joinOpenRoom(roomName: string): Promise<void> {
        await vi.waitFor(() => expect(fixture.nativeElement.querySelectorAll('app-open-rooms li')).toHaveLength(2));
        await fixture.whenStable();
        const row: Element = Array.from(fixture.nativeElement.querySelectorAll('app-open-rooms li') as NodeListOf<Element>)
            .find((item: Element) => item.textContent.includes(roomName)) as Element;
        (row.querySelector('button') as HTMLButtonElement).click();
        await fixture.whenStable();
    }

    function errors(): string[] {
        return Array.from(fixture.nativeElement.querySelectorAll('mat-error'), (error: Element) => error.textContent.trim());
    }

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test.each<[string, number, string]>([
        ['create', 0, 'create'],
        ['join', 1, 'join'],
    ])('should %s the typed room', async (_action: string, button: number, type: string) => {
        // Given
        await createComponent();
        await typeIn('Nom de la salle', 'room');
        await typeIn('Nom du joueur', 'player');

        // When
        buttons()[button].click();
        await fixture.whenStable();

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith(type, 'room', 'player', undefined);
    });

    test.each<[string, number, string]>([
        ['create', 0, 'create'],
        ['join', 1, 'join'],
    ])('should %s the typed private room with its password', async (_action: string, button: number, type: string) => {
        // Given
        await createComponent();
        await typeIn('Nom de la salle', 'room');
        await typeIn('Nom du joueur', 'player');
        await typeIn('Mot de passe (salle privée)', 'secret');

        // When
        buttons()[button].click();
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('app-text-field[label="Mot de passe (salle privée)"] input').type).toEqual('password');
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith(type, 'room', 'player', 'secret');
    });

    test('should join a public room of the list', async () => {
        // Given
        await createComponent();
        await typeIn('Nom du joueur', 'player');

        // When
        await joinOpenRoom('public');

        // Then
        expect(dialogService.open).not.toHaveBeenCalled();
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith('join', 'public', 'player', undefined);
        expect(fixture.nativeElement.querySelector('app-text-field[label="Nom de la salle"] input').value).toEqual('public');
    });

    test('should join a private room of the list with the password asked', async () => {
        // Given
        await createComponent();
        vi.mocked(dialogService.open).mockResolvedValue('secret');
        await typeIn('Nom du joueur', 'player');

        // When
        await joinOpenRoom('private');

        // Then
        expect(dialogService.open).toHaveBeenCalledExactlyOnceWith(RoomPasswordDialog, { title: 'Salle privée', inputs: { roomName: 'private' } });
        await vi.waitFor(() => expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith('join', 'private', 'player', 'secret'));
    });

    test('should not join a private room of the list once its password is not given', async () => {
        // Given
        await createComponent();
        vi.mocked(dialogService.open).mockResolvedValue(undefined);
        await typeIn('Nom du joueur', 'player');

        // When
        await joinOpenRoom('private');

        // Then
        await vi.waitFor(() => expect(dialogService.open).toHaveBeenCalled());
        await fixture.whenStable();
        expect(roomSetupService.setup).not.toHaveBeenCalled();
    });

    test('should require the player name before asking the password of a room of the list', async () => {
        // Given
        await createComponent();

        // When
        await joinOpenRoom('private');

        // Then
        expect(dialogService.open).not.toHaveBeenCalled();
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(errors()).toEqual(['Le nom du joueur est requis']);
    });

    test('should require the room and player names, and show their errors instead of setting the room up', async () => {
        // Given
        await createComponent();
        await typeIn('Nom du joueur', 'player');

        // When
        buttons()[0].click();
        await fixture.whenStable();

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(errors()).toEqual(['Le nom de la salle est requis']);
        expect(fixture.nativeElement.querySelectorAll('.mat-mdc-form-field-required-marker')).toHaveLength(2);

        // When
        await typeIn('Nom du joueur', '');
        buttons()[1].click();
        await fixture.whenStable();

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(errors()).toEqual(['Le nom de la salle est requis', 'Le nom du joueur est requis']);
    });

    test('should reject a name of spaces only', async () => {
        // Given
        await createComponent();
        await typeIn('Nom de la salle', '   ');
        await typeIn('Nom du joueur', 'player');

        // When
        buttons()[0].click();
        await fixture.whenStable();

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        expect(errors()).toEqual(['Le nom de la salle est requis']);
    });

    test('should display a spinner while loading and hide once the room is setup', async () => {
        // Given
        await createComponent();

        // When
        roomSetupService.setup('create', 'room', 'player');
        await fixture.whenStable();

        // Then
        expect(buttons()).toHaveLength(0);
        expect(fixture.nativeElement.querySelector('app-open-rooms')).toBeNull();
        expect(fixture.nativeElement.querySelector('mat-spinner')).not.toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('input')).toBeNull();
    });

    test('should automatically create the room', async () => {
        // When
        await createComponent({ 'auto-create': '', room: 'my-room' });

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('create', 'my-room', '123456', undefined);
    });

    test.each<[string, Params]>([
        ['no room', { 'auto-create': '' }],
        ['an empty room', { 'auto-create': '', room: '' }],
    ])('should automatically create the default room for a link with %s', async (_case: string, params: Params) => {
        // When
        await createComponent(params);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('create', 'test', '123456', undefined);
    });

    test('should automatically join the room after a delay', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '', room: 'my-room' });

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'my-room', '123456', undefined);
    });

    test('should automatically join the default room', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '' });
        await vi.advanceTimersByTimeAsync(1000);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'test', '123456', undefined);
    });
});
