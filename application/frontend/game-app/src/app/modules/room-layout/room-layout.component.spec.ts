import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomLayoutComponent } from './room-layout.component';
import { RoomHttpApi } from '@app/services/room-api/room-http.api';
import RoomSetupService from '@app/services/room-setup/room-setup.service';
import { RoomGame } from '@protocol/room-game.enum';
import { openRoomsHttpApi } from '@testing/room-http-api.mock';
import { beforeEach, describe, expect, test } from 'vitest';

describe('RoomLayoutComponent', () => {
    let fixture: ComponentFixture<RoomLayoutComponent>;
    let roomSetupService: RoomSetupService;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [RoomLayoutComponent],
            providers: [RoomSetupService, { provide: RoomHttpApi, useValue: openRoomsHttpApi() }],
        }).compileComponents();

        roomSetupService = TestBed.inject(RoomSetupService);
        fixture = TestBed.createComponent(RoomLayoutComponent);
        fixture.componentRef.setInput('game', RoomGame.CHESS);
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
<app-room-layout [game]="game" [dimContent]="false">
    <p class="presentation" roomPresentation>Presentation</p>
    <p class="content">Content</p>
</app-room-layout>`,
        })
        class HostComponent {
            protected readonly game: RoomGame = RoomGame.CHESS;
        }
        const host: ComponentFixture<HostComponent> = TestBed.createComponent(HostComponent);
        await host.whenStable();

        // Then the presentation comes after the setup, the open rooms on top of the page
        const presentation: HTMLElement | null = host.nativeElement.querySelector('.presentation');
        expect(presentation).not.toBeNull();
        expect(presentation?.compareDocumentPosition(host.nativeElement.querySelector('app-room-setup'))).toEqual(Node.DOCUMENT_POSITION_PRECEDING);
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
