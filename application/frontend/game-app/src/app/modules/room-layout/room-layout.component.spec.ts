import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomLayoutComponent } from './room-layout.component';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { beforeEach, describe, expect, test } from 'vitest';

describe('RoomLayoutComponent', () => {
    let fixture: ComponentFixture<RoomLayoutComponent>;
    let roomSetupService: RoomSetupService;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [RoomSetupService],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        fixture = TestBed.createComponent(RoomLayoutComponent);
        fixture.componentRef.setInput('maxPlayer', 2);
        await fixture.whenStable();
    });

    test('should cover the content until the room is setup', async () => {
        // Then
        expect(fixture.nativeElement.querySelector('app-room-setup')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).not.toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.querySelector('#room-content-overlay')).toBeNull();
    });
});
