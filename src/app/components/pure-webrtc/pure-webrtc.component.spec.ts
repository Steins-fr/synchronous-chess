import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PureWebrtcComponent } from './pure-webrtc.component';
import { JoinComponent } from './join/join.component';
import { CreateComponent } from './create/create.component';
import { FormsModule } from '@angular/forms';
import { WebrtcStatesComponent } from '../shared/debug/webrtc-states/webrtc-states.component';
import { IcecandidatesComponent } from '../shared/debug/icecandidates/icecandidates.component';

describe('PureWebrtcComponent', () => {
    let component: PureWebrtcComponent;
    let fixture: ComponentFixture<PureWebrtcComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                PureWebrtcComponent,
                JoinComponent,
                CreateComponent,
                WebrtcStatesComponent,
                IcecandidatesComponent
            ],
            imports: [
                FormsModule
            ],
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(PureWebrtcComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
