import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WebrtcStatesComponent } from './webrtc-states.component';

describe('WebrtcStatesComponent', () => {
    let component: WebrtcStatesComponent;
    let fixture: ComponentFixture<WebrtcStatesComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [WebrtcStatesComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(WebrtcStatesComponent);
        component = fixture.componentInstance;
        component.playerName = 'playerName';
        component.states = {
            error: '',
            iceConnection: 'None',
            sendChannel: 'None',
            receiveChannel: 'None',
            iceGathering: 'None',
            signaling: 'None',
            candidates: []
        };
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
