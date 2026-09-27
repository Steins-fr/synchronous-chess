import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebrtcDebugComponent } from './webrtc-debug.component';
import { RoomSocketApi } from '@app/services/room-api/room-socket.api';
import { Negotiator } from '@app/services/room-manager/classes/negotiator/negotiator';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { Room } from '@app/services/room-manager/classes/room/room';
import { RoomNetworkMock } from '@testing/room-network.mock';
import { TestHelper } from '@testing/test.helper';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

describe('WebrtcDebugComponent', () => {
    let fixture: ComponentFixture<WebrtcDebugComponent<object>>;
    let player: WebRtcPlayer;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [WebrtcDebugComponent],
        }).compileComponents();

        const network: RoomNetworkMock = new RoomNetworkMock();
        const negotiatorWebrtc: WebrtcMock = new WebrtcMock();
        network.negotiators.set(new Map([['pending', TestHelper.cast<Negotiator>({ playerName: 'pending', states: negotiatorWebrtc.states })]]));
        const room: Room<object> = new Room<object>(TestHelper.cast<RoomSocketApi>({}), network.roomNetwork);
        player = new WebRtcPlayer('remote', new WebrtcMock().webrtc);
        network.playerAdded$.next(player);

        fixture = TestBed.createComponent(WebrtcDebugComponent<object>);
        fixture.componentRef.setInput('room', room);
        await fixture.whenStable();
    });

    afterEach(() => {
        player.clear();
    });

    test('should display the states of the remote players and the negotiators', () => {
        const titles: string[] = Array.from(fixture.nativeElement.querySelectorAll('h4')).map((title) => (title as HTMLElement).textContent ?? '');

        expect(titles).toEqual([
            'Debug connexion du joueur : remote',
            'Debug connexion du négociateur : pending',
        ]);
        expect(fixture.nativeElement.querySelectorAll('app-debug-webrtc-states')).toHaveLength(2);
        expect(fixture.nativeElement.textContent).toContain('RTC states of remote');
    });
});
