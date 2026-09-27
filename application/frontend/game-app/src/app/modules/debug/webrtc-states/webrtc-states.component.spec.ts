import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebrtcStatesComponent } from './webrtc-states.component';
import WebrtcStates, { defaultWebrtcStates } from '@app/services/room-manager/classes/webrtc/webrtc-states';
import { TestHelper } from '@testing/test.helper';
import { beforeEach, describe, expect, test } from 'vitest';

describe('WebrtcStatesComponent', () => {
    let fixture: ComponentFixture<WebrtcStatesComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [WebrtcStatesComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(WebrtcStatesComponent);
        fixture.componentRef.setInput('playerName', 'remote');
    });

    test('should render nothing without states', async () => {
        // When
        fixture.componentRef.setInput('states', null);
        await fixture.whenStable();

        // Then
        expect(fixture.nativeElement.textContent.trim()).toEqual('');
    });

    test('should render the states and the candidates', async () => {
        // Given
        const states: WebrtcStates = {
            ...defaultWebrtcStates,
            iceConnection: 'connected',
            candidates: [TestHelper.cast<WebrtcStates['candidates'][number]>({ elapsed: '0.100', type: 'host', port: 1234, priorities: '1 | 2 | 3' })],
        };

        // When
        fixture.componentRef.setInput('states', states);
        await fixture.whenStable();

        // Then
        const element: HTMLElement = fixture.nativeElement;
        expect(element.textContent).toContain('RTC states of remote');
        expect(element.querySelector('#state-ice-connection')?.textContent).toEqual('connected');
        expect(element.querySelector('#state-ice-gathering')?.textContent).toEqual('new');
        expect(element.querySelector('#state-signaling')?.textContent).toEqual('have-local-offer');
        expect(element.querySelector('#state-send-channel')?.textContent).toEqual('connecting');
        expect(element.querySelector('#state-receive-channel')?.textContent).toEqual('connecting');
        expect(element.querySelectorAll('#candidatesBody tr')).toHaveLength(1);
        expect(element.querySelector('#candidatesBody tr')?.textContent).toContain('1 | 2 | 3');
    });
});
