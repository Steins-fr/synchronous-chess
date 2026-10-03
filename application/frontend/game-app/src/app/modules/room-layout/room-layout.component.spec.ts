import { Component } from '@angular/core';
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

    test('should show the presentation of a page until the room is setup, without covering its content', async () => {
        // Given
        @Component({
            imports: [RoomLayoutComponent],
            template: `
<app-room-layout [maxPlayer]="2" [dimContent]="false">
    <p class="presentation" roomPresentation>Presentation</p>
    <p class="content">Content</p>
</app-room-layout>`,
        })
        class HostComponent {}
        const host: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
        await host.whenStable();

        // Then the presentation comes before the setup form
        const presentation: HTMLElement | null = host.nativeElement.querySelector('.presentation');
        expect(presentation).not.toBeNull();
        expect(presentation?.compareDocumentPosition(host.nativeElement.querySelector('app-room-setup'))).toEqual(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(host.nativeElement.querySelector('#page-content .content')).not.toBeNull();
        expect(host.nativeElement.querySelector('#room-content-overlay')).toBeNull();

        // When
        roomSetupService.roomIsSetup(true);
        await host.whenStable();

        // Then
        expect(host.nativeElement.querySelector('.presentation')).toBeNull();
        expect(host.nativeElement.querySelector('#page-content .content')).not.toBeNull();
    });
});
