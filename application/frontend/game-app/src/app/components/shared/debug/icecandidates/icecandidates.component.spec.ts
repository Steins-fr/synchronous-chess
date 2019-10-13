import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { IcecandidatesComponent } from './icecandidates.component';
import { Webrtc } from 'src/app/classes/webrtc/webrtc';

describe('IcecandidatesComponent', () => {
    let component: IcecandidatesComponent;
    let fixture: ComponentFixture<IcecandidatesComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [IcecandidatesComponent]
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(IcecandidatesComponent);
        component = fixture.componentInstance;
        component.playerName = 'playerName';
        component.webRTC = new Webrtc();
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
