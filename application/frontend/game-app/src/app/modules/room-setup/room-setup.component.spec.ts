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

    async function type(name: string, value: string): Promise<void> {
        const input: HTMLInputElement = fixture.nativeElement.querySelector(`input[name="${ name }"]`);
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
    }

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test('should create or join the typed room', async () => {
        // Given
        await createComponent();
        await type('room-name', 'room');
        await type('player', 'player');

        // When
        buttons()[0].click();
        buttons()[1].click();

        // Then
        expect(roomSetupService.setup).toHaveBeenNthCalledWith(1, 'create', 'room', 'player');
        expect(roomSetupService.setup).toHaveBeenNthCalledWith(2, 'join', 'room', 'player');
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

    test('should automatically create the default room', async () => {
        // When
        await createComponent({ 'auto-create': '' });

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
        vi.advanceTimersByTime(1000);
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'my-room', '123456');
    });

    test('should automatically join the default room', async () => {
        // Given
        vi.useFakeTimers();

        // When
        await createComponent({ 'auto-join': '' });
        vi.advanceTimersByTime(1000);

        // Then
        expect(roomSetupService.setup).toHaveBeenCalledWith('join', 'test', '123456');
    });
});
