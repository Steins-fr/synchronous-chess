import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { WebrtcDebugButtonComponent } from './webrtc-debug-button.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('WebrtcDebugButtonComponent', () => {
    let fixture: ComponentFixture<WebrtcDebugButtonComponent<object>>;
    let player: WebRtcPlayer;

    function button(): HTMLButtonElement {
        return fixture.nativeElement.querySelector('#webrtc-debug-open');
    }

    /** The sheet lies in the overlay, out of the fixture */
    function sheet(): HTMLElement | null {
        return document.querySelector('mat-bottom-sheet-container');
    }

    async function open(): Promise<void> {
        button().click();
        await fixture.whenStable();
    }

    async function closed(): Promise<void> {
        await vi.waitFor(() => expect(sheet()).toBeNull());
    }

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [WebrtcDebugButtonComponent],
            providers: [
                // jsdom runs no animation: the sheet would never finish closing. Disabled, Material simulates them, the sheet
                // closing on the next turn of the event loop
                { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
                // The media queries of jsdom have no listener, which the sheet observes for its width: a phone
                {
                    provide: BreakpointObserver, useValue: TestHelper.cast<BreakpointObserver>({
                        observe: () => of<BreakpointState>({ matches: false, breakpoints: {} }),
                        isMatched: (): boolean => false,
                    }),
                },
            ],
        }).compileComponents();

        const network: RoomNetworkMock = new RoomNetworkMock();
        network.negotiators.set(new Map([['pending', TestHelper.cast<Negotiator>({ playerName: 'pending', states: new WebrtcMock().states })]]));
        const room: Room<object> = new Room<object>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        player = new WebRtcPlayer('remote', new WebrtcMock().webrtc);
        network.playerAdded$.next(player);

        fixture = TestBed.createComponent(WebrtcDebugButtonComponent<object>);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
    });

    afterEach(() => {
        player.clear();
    });

    test('should open the connections of the room in a bottom sheet, closed by its button, the focus back on the button', async () => {
        // Given
        expect(button().getAttribute('aria-label')).toEqual('WebRTC debug');
        expect(button().getAttribute('title')).toEqual('WebRTC debug');
        expect(button().getAttribute('aria-haspopup')).toEqual('dialog');
        expect(sheet()).toBeNull();

        // When
        await open();

        // Then
        expect(sheet()?.getAttribute('role')).toEqual('dialog');
        expect(sheet()?.getAttribute('aria-label')).toEqual('WebRTC debug');
        expect(sheet()?.querySelector('h2')?.textContent).toEqual('WebRTC debug');
        const titles: string[] = Array.from(sheet()?.querySelectorAll('h3') ?? [], (title: Element) => title.textContent);
        expect(titles).toEqual(['Connection to the player: remote', 'Connection to the negotiator: pending']);
        expect(sheet()?.textContent).toContain('RTC states of remote');

        // When
        sheet()?.querySelector<HTMLButtonElement>('#webrtc-debug-close')?.click();

        // Then
        await closed();
        expect(document.activeElement).toBe(button());
    });

    test('should close the sheet with a click beside it', async () => {
        // Given
        await open();
        expect(sheet()).not.toBeNull();

        // When
        document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();

        // Then
        await closed();
    });

    test('should close the sheet once its button is gone: the room given up, the page left', async () => {
        // Given
        await open();
        expect(sheet()).not.toBeNull();

        // When
        fixture.destroy();

        // Then
        await closed();
    });

    test('should be destroyed without a sheet', () => {
        expect(() => fixture.destroy()).not.toThrow();
    });
});
