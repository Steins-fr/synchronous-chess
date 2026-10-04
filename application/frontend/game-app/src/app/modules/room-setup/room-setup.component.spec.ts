import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Params } from '@angular/router';
import { RoomSetupComponent } from './room-setup.component';
import { CryptoHelper } from '@app/helpers/crypto.helper';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { afterEach, describe, expect, test, vi } from 'vitest';

describe('RoomSetupComponent', () => {
    let fixture: ComponentFixture<RoomSetupComponent>;
    let roomSetupService: RoomSetupService;

    async function createComponent(queryParams: Params = {}): Promise<void> {
        await TestBed.configureTestingModule({
            imports: [RoomSetupComponent],
            providers: [
                RoomSetupService,
                { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
            ],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        vi.spyOn(roomSetupService, 'setup');
        vi.spyOn(CryptoHelper, 'randomNumber').mockReturnValue(123456);
        fixture = TestBed.createComponent(RoomSetupComponent);
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
        expect(roomSetupService.setup).toHaveBeenCalledExactlyOnceWith(type, 'room', 'player');
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
        expect(roomSetupService.setup).toHaveBeenCalledWith('create', 'my-room', '123456');
    });

    test.each<[string, Params]>([
        ['no room', { 'auto-create': '' }],
        ['an empty room', { 'auto-create': '', room: '' }],
    ])('should automatically create the default room for a link with %s', async (_case: string, params: Params) => {
        // When
        await createComponent(params);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('create', 'test', '123456');
    });

    test('should automatically join the room after a delay', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '', room: 'my-room' });

        // Then
        expect(roomSetupService.setup).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'my-room', '123456');
    });

    test('should automatically join the default room', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '' });
        await vi.advanceTimersByTimeAsync(1000);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'test', '123456');
    });
});
