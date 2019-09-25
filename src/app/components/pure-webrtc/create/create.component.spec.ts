import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateComponent } from './create.component';
import { FormsModule } from '@angular/forms';
import { IcecandidatesComponent } from '../../shared/debug/icecandidates/icecandidates.component';
import { WebrtcStatesComponent } from '../../shared/debug/webrtc-states/webrtc-states.component';

describe('CreateComponent', () => {
    let component: CreateComponent;
    let fixture: ComponentFixture<CreateComponent>;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            declarations: [
                CreateComponent,
                IcecandidatesComponent,
                WebrtcStatesComponent],
            imports: [
                FormsModule
            ],
        })
            .compileComponents();
    }));

    beforeEach(() => {
        fixture = TestBed.createComponent(CreateComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
