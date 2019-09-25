import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { JoinComponent } from './join.component';
import { FormsModule } from '@angular/forms';
import { IcecandidatesComponent } from '../../shared/debug/icecandidates/icecandidates.component';
import { WebrtcStatesComponent } from '../../shared/debug/webrtc-states/webrtc-states.component';

describe('JoinComponent', () => {
    let component: JoinComponent;
    let fixture: ComponentFixture<JoinComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                JoinComponent,
                IcecandidatesComponent,
                WebrtcStatesComponent],
            imports: [
                FormsModule
            ],
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(JoinComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
