import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { WebrtcStatesComponent } from './webrtc-states.component';
import { Webrtc } from 'src/app/classes/webrtc/webrtc';

describe('WebrtcStatesComponent', () => {
    let component: WebrtcStatesComponent;
    let fixture: ComponentFixture<WebrtcStatesComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [WebrtcStatesComponent]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(WebrtcStatesComponent);
        component = fixture.componentInstance;
        component.playerName = 'playerName';
        component.webRTC = new Webrtc();
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
