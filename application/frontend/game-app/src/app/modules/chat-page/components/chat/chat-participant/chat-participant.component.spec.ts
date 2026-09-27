import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatParticipantComponent } from './chat-participant.component';
import { LocalPlayer } from '@app/services/room-manager/classes/player/local-player';
import { WebRtcPlayer } from '@app/services/room-manager/classes/player/web-rtc-player';
import { WebrtcMock } from '@testing/webrtc.mock';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

describe('ChatParticipantComponent', () => {
    let fixture: ComponentFixture<ChatParticipantComponent>;
    let remotePlayer: WebRtcPlayer;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChatParticipantComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ChatParticipantComponent);
        remotePlayer = new WebRtcPlayer('remote', new WebrtcMock().webrtc);
    });

    afterEach(() => {
        remotePlayer.clear();
    });

    test('should display the local player without ping', async () => {
        // When
        fixture.componentRef.setInput('player', new LocalPlayer('local'));
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.textContent.trim()).toEqual('local');
        expect(fixture.nativeElement.querySelector('mat-chip').classList).toContain('mat-primary');
    });

    test('should display the ping of a remote player', async () => {
        // Given
        fixture.componentRef.setInput('player', remotePlayer);
        await fixture.whenStable();

        // When
        remotePlayer.ping.next('12.5');
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.textContent.replace(/\s+/g, ' ').trim()).toEqual('remote - ping 12.5');
        expect(fixture.nativeElement.querySelector('mat-chip').classList).toContain('mat-accent');
    });

    test('should stop following the ping of a previous player', async () => {
        // Given
        fixture.componentRef.setInput('player', remotePlayer);
        await fixture.whenStable();

        // When
        fixture.componentRef.setInput('player', new LocalPlayer('local'));
        await fixture.whenStable();
        remotePlayer.ping.next('12.5');
        await fixture.whenStable();

        // Then
        expect(remotePlayer.ping.observed).toEqual(false);
        expect(fixture.nativeElement.textContent.trim()).toEqual('local');
    });
});
